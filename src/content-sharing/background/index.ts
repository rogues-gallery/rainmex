import chunk from 'lodash/chunk'
import fromPairs from 'lodash/fromPairs'
import pick from 'lodash/pick'
import StorageManager from '@worldbrain/storex'
import {
    AddSharedListEntriesAction,
    ContentSharingInterface,
    ContentSharingEvents,
    ContentSharingAction,
    ContentSharingQueueInteraction,
} from './types'
import { ContentSharingStorage, ContentSharingClientStorage } from './storage'
import CustomListStorage from 'src/custom-lists/background/storage'
import { AuthBackground } from 'src/authentication/background'
import {
    StorageOperationEvent,
    DeletionStorageChange,
    ModificationStorageChange,
    CreationStorageChange,
} from '@worldbrain/storex-middleware-change-watcher/lib/types'
import { PageListEntry } from 'src/custom-lists/background/types'
import createResolvable, { Resolvable } from '@josephg/resolvable'
import { normalizeUrl } from '@worldbrain/memex-url-utils'
import { Analytics } from 'src/analytics/types'
import AnnotationStorage from 'src/annotations/background/storage'
import { Annotation, AnnotationPrivacyLevels } from 'src/annotations/types'
import { getNoteShareUrl } from 'src/content-sharing/utils'
import {
    remoteEventEmitter,
    RemoteEventEmitter,
} from 'src/util/webextensionRPC'
import ActivityStreamsBackground from 'src/activity-streams/background'
import {
    UserMessageService,
    UserMessageEvents,
} from '@worldbrain/memex-common/lib/user-messages/service/types'
import {
    SharedListReference,
    SharedAnnotationReference,
} from '@worldbrain/memex-common/lib/content-sharing/types'
import { Services } from 'src/services/types'
import * as annotationUtils from 'src/annotations/utils'
import { ServerStorageModules } from 'src/storage/types'

// interface ListPush {
//     actionsPending: number
//     promise: Resolvable<void> | null
// }

export default class ContentSharingBackground {
    remoteEmitter: RemoteEventEmitter<ContentSharingEvents>
    remoteFunctions: ContentSharingInterface
    storage: ContentSharingClientStorage
    shouldProcessSyncChanges = true

    _hasPendingActions = false
    _queingAction?: Resolvable<void>
    _executingPendingActions?: Resolvable<{ result: 'success' | 'error' }>
    _processingUserMessage?: Resolvable<void>

    _pendingActionsRetry?: Resolvable<void>
    _scheduledRetry: () => Promise<void>
    _scheduledRetryTimeout: ReturnType<typeof setTimeout>

    _ensuredPages: { [normalizedUrl: string]: string } = {}

    private readonly ACTION_RETRY_INTERVAL = 1000 * 60 * 5

    // _listPushes: {
    //     [localListId: number]: ListPush
    // } = {}

    constructor(
        private options: {
            storageManager: StorageManager
            customLists: CustomListStorage
            annotationStorage: AnnotationStorage
            auth: AuthBackground
            analytics: Analytics
            activityStreams: Pick<ActivityStreamsBackground, 'backend'>
            userMessages: UserMessageService
            services: Pick<Services, 'contentSharing'>
            getServerStorage: () => Promise<
                Pick<ServerStorageModules, 'contentSharing'>
            >
        },
    ) {
        this.storage = new ContentSharingClientStorage({
            storageManager: options.storageManager,
        })

        this.remoteEmitter = remoteEventEmitter('contentSharing', {
            broadcastToTabs: true,
        })

        this.remoteFunctions = {
            ...options.services.contentSharing,
            shareList: this.shareList,
            shareListEntries: this.shareListEntries,
            shareAnnotation: this.shareAnnotation,
            shareAnnotations: this.shareAnnotations,
            executePendingActions: this.executePendingActions.bind(this),
            shareAnnotationsToLists: this.shareAnnotationsToLists,
            unshareAnnotationsFromLists: this.unshareAnnotationsFromLists,
            unshareAnnotation: this.unshareAnnotation,
            ensureRemotePageId: this.ensureRemotePageId,
            getRemoteAnnotationLink: this.getRemoteAnnotationLink,
            getRemoteListId: async (callOptions) => {
                return this.storage.getRemoteListId({
                    localId: callOptions.localListId,
                })
            },
            getRemoteListIds: async (callOptions) => {
                return this.storage.getRemoteListIds({
                    localIds: callOptions.localListIds,
                })
            },
            getRemoteAnnotationIds: async (callOptions) => {
                return this.storage.getRemoteAnnotationIds({
                    localIds: callOptions.annotationUrls,
                })
            },
            getRemoteAnnotationMetadata: async (callOptions) => {
                return this.storage.getRemoteAnnotationMetadata({
                    localIds: callOptions.annotationUrls,
                })
            },
            areListsShared: async (callOptions) => {
                return this.storage.areListsShared({
                    localIds: callOptions.localListIds,
                })
            },
            getAllRemoteLists: this.getAllRemoteLists,
            waitForSync: this.waitForSync,
        }
        options.userMessages.events.on('message', this._processUserMessage)
    }

    async setup() {
        try {
            await this.executePendingActions()
        } catch (e) {
            // Log the error, but don't stop the entire extension setup
            // when we can't reach the sharing back-end
            console.error(e)
        }
    }

    private getRemoteAnnotationLink: ContentSharingInterface['getRemoteAnnotationLink'] = async ({
        annotationUrl,
    }) => {
        const remoteIds = await this.storage.getRemoteAnnotationIds({
            localIds: [annotationUrl],
        })
        const remoteAnnotationId = remoteIds[annotationUrl]?.toString()

        if (remoteAnnotationId == null) {
            return null
        }

        return getNoteShareUrl({ remoteAnnotationId })
    }

    getAllRemoteLists: ContentSharingInterface['getAllRemoteLists'] = async () => {
        const remoteListIdsDict = await this.storage.getAllRemoteListIds()
        const remoteListData: Array<{
            localId: number
            remoteId: string
            name: string
        }> = []

        for (const localId of Object.keys(remoteListIdsDict).map(Number)) {
            const list = await this.options.customLists.fetchListById(localId)
            remoteListData.push({
                localId,
                remoteId: remoteListIdsDict[localId],
                name: list.name,
            })
        }

        return remoteListData
    }

    shareList: ContentSharingInterface['shareList'] = async (options) => {
        const localList = await this.options.customLists.fetchListById(
            options.listId,
        )
        if (!localList) {
            throw new Error(
                `Tried to share non-existing list: ID ${options.listId}`,
            )
        }
        const userId = (await this.options.auth.authService.getCurrentUser())
            ?.id
        if (!userId) {
            throw new Error(`Tried to share list without being authenticated`)
        }

        const { contentSharing } = await this.options.getServerStorage()
        const listReference = await contentSharing.createSharedList({
            listData: {
                title: localList.name,
            },
            userReference: {
                type: 'user-reference',
                id: userId,
            },
            localListId: options.listId,
        })
        await this.storage.storeListId({
            localId: options.listId,
            remoteId: contentSharing.getSharedListLinkID(listReference),
        })

        this.options.analytics.trackEvent({
            category: 'ContentSharing',
            action: 'shareList',
        })

        return {
            remoteListId: contentSharing.getSharedListLinkID(listReference),
        }
    }

    shareListEntries: ContentSharingInterface['shareListEntries'] = async (
        options,
    ) => {
        const userId = (await this.options.auth.authService.getCurrentUser())
            ?.id
        if (!userId) {
            throw new Error(`Tried to share list without being authenticated`)
        }
        const remoteListId = await this.storage.getRemoteListId({
            localId: options.listId,
        })
        if (!remoteListId) {
            throw new Error(
                `Tried to share list entries of list that isn't shared yet`,
            )
        }
        const pages = await this.options.customLists.fetchListPagesById({
            listId: options.listId,
        })
        const normalizedPageUrls = pages.map((entry) => entry.pageUrl)
        const pageTitles = await this.storage.getPageTitles({
            normalizedPageUrls,
        })

        const chunkSize = 100
        for (const entryChunk of chunk(pages, chunkSize)) {
            const data: AddSharedListEntriesAction['data'] = entryChunk.map(
                (entry) => ({
                    createdWhen: entry.createdAt?.getTime() ?? '$now',
                    entryTitle: pageTitles[entry.pageUrl],
                    normalizedUrl: entry.pageUrl,
                    originalUrl: entry.fullUrl,
                }),
            )
            await this.scheduleAction(
                {
                    type: 'add-shared-list-entries',
                    localListId: options.listId,
                    remoteListId,
                    data,
                },
                {
                    queueInteraction:
                        options.queueInteraction ?? 'queue-and-return',
                },
            )
        }

        const annotationEntries = await this.options.annotationStorage.listAnnotationsByPageUrls(
            { pageUrls: normalizedPageUrls },
        )
        await this._scheduleAddAnnotationEntries({
            annotations: annotationEntries,
            remoteListIds: [remoteListId],
            queueInteraction: options.queueInteraction ?? 'queue-and-return',
        })
    }

    shareAnnotation: ContentSharingInterface['shareAnnotation'] = async (
        options,
    ) => {
        const remoteAnnotationId = (
            await this.storage.getRemoteAnnotationIds({
                localIds: [options.annotationUrl],
            })
        )[options.annotationUrl]
        if (remoteAnnotationId) {
            return
        }

        const annotation = await this.options.annotationStorage.getAnnotationByPk(
            options.annotationUrl,
        )
        const page = (
            await this.storage.getPages({
                normalizedPageUrls: [annotation.pageUrl],
            })
        )[annotation.pageUrl]
        await this.scheduleAction(
            {
                type: 'ensure-page-info',
                data: [
                    {
                        createdWhen: '$now',
                        ...pick(
                            page,
                            'normalizedUrl',
                            'originalUrl',
                            'fullTitle',
                        ),
                    },
                ],
            },
            { queueInteraction: options.queueInteraction ?? 'queue-and-await' },
        )

        const shareAnnotationsAction: ContentSharingAction = {
            type: 'share-annotations',
            localListIds: [],
            // localListIds: sharedListIds,
            data: {
                [annotation.pageUrl]: [
                    {
                        localId: annotation.url,
                        createdWhen: annotation.createdWhen?.getTime?.(),
                        body: annotation.body ?? null,
                        comment: annotation.comment ?? null,
                        selector: annotation.selector
                            ? JSON.stringify(annotation.selector)
                            : null,
                    },
                ],
            },
        }
        await this.scheduleAction(shareAnnotationsAction, {
            queueInteraction: options.queueInteraction ?? 'queue-and-await',
        })

        this.options.analytics.trackEvent({
            category: 'ContentSharing',
            action: 'shareAnnotation',
        })
    }

    shareAnnotations: ContentSharingInterface['shareAnnotations'] = async (
        options,
    ) => {
        const remoteIds = await this.storage.getRemoteAnnotationIds({
            localIds: options.annotationUrls,
        })
        const allAnnotations = await this.options.annotationStorage.getAnnotations(
            options.annotationUrls,
        )

        const annotPrivacyLevels = await this.options.annotationStorage.getPrivacyLevelsByAnnotation(
            {
                annotations: options.annotationUrls,
            },
        )

        const annotations = allAnnotations.filter(
            (annotation) =>
                !remoteIds[annotation.url] &&
                (!annotPrivacyLevels[annotation.url] ||
                    annotPrivacyLevels[annotation.url]?.privacyLevel >
                        AnnotationPrivacyLevels.PROTECTED),
        )

        const allPageUrls = new Set(
            annotations.map((annotation) => annotation.pageUrl),
        )
        const pageUrls = new Set(
            annotations.map((annotation) => annotation.pageUrl),
        )
        const allPages = await this.storage.getPages({
            normalizedPageUrls: [...allPageUrls],
        })
        for (const pageUrl of pageUrls) {
            await this.scheduleAction(
                {
                    type: 'ensure-page-info',
                    data: [
                        {
                            createdWhen: '$now',
                            ...pick(
                                allPages[pageUrl],
                                'normalizedUrl',
                                'originalUrl',
                                'fullTitle',
                            ),
                        },
                    ],
                },
                {
                    queueInteraction:
                        options.queueInteraction ?? 'queue-and-await',
                },
            )
        }
        if (!annotations.length) {
            return
        }

        const shareAnnotationsAction: ContentSharingAction = {
            type: 'share-annotations',
            localListIds: [],
            data: {},
        }
        for (const pageUrl of pageUrls) {
            shareAnnotationsAction.data[pageUrl] = annotations
                .filter((annotation) => annotation.pageUrl === pageUrl)
                .map((annotation) => ({
                    localId: annotation.url,
                    createdWhen: annotation.createdWhen?.getTime?.(),
                    body: annotation.body ?? null,
                    comment: annotation.comment ?? null,
                    selector: annotation.selector
                        ? JSON.stringify(annotation.selector)
                        : null,
                }))
            if (!shareAnnotationsAction.data[pageUrl].length) {
                delete shareAnnotationsAction.data[pageUrl]
            }
        }
        if (!Object.keys(shareAnnotationsAction.data).length) {
            return
        }
        await this.scheduleAction(shareAnnotationsAction, {
            queueInteraction: options.queueInteraction ?? 'queue-and-await',
        })
    }

    shareAnnotationsToLists: ContentSharingInterface['shareAnnotationsToLists'] = async (
        options,
    ) => {
        const allAnnotationMetadata = await this.storage.getRemoteAnnotationMetadata(
            {
                localIds: options.annotationUrls,
            },
        )
        await this.storage.setAnnotationsExcludedFromLists({
            localIds: options.annotationUrls,
            excludeFromLists: false,
        })
        const allAnnotations = await this.options.annotationStorage.getAnnotations(
            options.annotationUrls,
        )
        const pageUrls = new Set(
            allAnnotations.map((annotation) => annotation.pageUrl),
        )
        for (const pageUrl of pageUrls) {
            const listIds = await this.options.customLists.fetchListIdsByUrl(
                pageUrl,
            )
            const areListsShared = await this.storage.areListsShared({
                localIds: listIds,
            })
            const sharedListIds = Object.entries(areListsShared)
                .filter(([, shared]) => shared)
                .map(([listId]) => parseInt(listId, 10))

            await this._scheduleAddAnnotationEntries({
                annotations: allAnnotations.filter(
                    (annotation) =>
                        annotation.pageUrl === pageUrl &&
                        allAnnotationMetadata[annotation.url]?.excludeFromLists,
                ),
                remoteListIds: Object.values(
                    await this.storage.getRemoteListIds({
                        localIds: sharedListIds,
                    }),
                ),
                queueInteraction:
                    options.queueInteraction ?? 'queue-and-return',
            })
        }
    }

    ensureRemotePageId: ContentSharingInterface['ensureRemotePageId'] = async (
        normalizedPageUrl,
    ) => {
        const userId = (await this.options.auth.authService.getCurrentUser())
            ?.id
        if (!userId) {
            throw new Error(
                `Tried to execute sharing action without being authenticated`,
            )
        }
        if (this._ensuredPages[normalizedPageUrl]) {
            return this._ensuredPages[normalizedPageUrl]
        }

        const userReference = {
            type: 'user-reference' as 'user-reference',
            id: userId,
        }

        const page = (
            await this.storage.getPages({
                normalizedPageUrls: [normalizedPageUrl],
            })
        )[normalizedPageUrl]
        const { contentSharing } = await this.options.getServerStorage()
        const reference = await contentSharing.ensurePageInfo({
            pageInfo: pick(page, 'fullTitle', 'originalUrl', 'normalizedUrl'),
            creatorReference: userReference,
        })
        const id = contentSharing.getSharedPageInfoLinkID(reference)
        this._ensuredPages[normalizedPageUrl] = id
        return id
    }

    unshareAnnotationsFromLists: ContentSharingInterface['unshareAnnotationsFromLists'] = async (
        options,
    ) => {
        await this.storage.setAnnotationsExcludedFromLists({
            localIds: options.annotationUrls,
            excludeFromLists: true,
        })
        const allAnnotations = await this.options.annotationStorage.getAnnotations(
            options.annotationUrls,
        )
        const pageUrls = new Set(
            allAnnotations.map((annotation) => annotation.pageUrl),
        )
        for (const pageUrl of pageUrls) {
            const localListIds = await this.options.customLists.fetchListIdsByUrl(
                pageUrl,
            )
            const remoteListIds = await this.storage.getRemoteListIds({
                localIds: localListIds,
            })
            const remoteAnnotationIds = await this.storage.getRemoteAnnotationIds(
                {
                    localIds: allAnnotations
                        .filter((annotation) => annotation.pageUrl === pageUrl)
                        .map((annotation) => annotation.url),
                },
            )

            for (const remoteListId of Object.values(remoteListIds)) {
                await this.scheduleAction(
                    {
                        type: 'remove-shared-annotation-list-entries',
                        remoteListId,
                        remoteAnnotationIds: Object.values(remoteAnnotationIds),
                    },
                    {
                        queueInteraction:
                            options.queueInteraction ?? 'queue-and-return',
                    },
                )
            }
        }
    }

    unshareAnnotation: ContentSharingInterface['unshareAnnotation'] = async (
        options,
    ) => {
        const remoteAnnotationId = (
            await this.storage.getRemoteAnnotationIds({
                localIds: [options.annotationUrl],
            })
        )[options.annotationUrl]
        if (!remoteAnnotationId) {
            throw new Error(
                `Tried to unshare an annotation which was not shared`,
            )
        }
        await this.storage.deleteAnnotationMetadata({
            localIds: [options.annotationUrl],
        })
        const action: ContentSharingAction = {
            type: 'unshare-annotations',
            remoteAnnotationIds: [remoteAnnotationId],
        }
        await this.scheduleAction(action, {
            queueInteraction: options.queueInteraction ?? 'queue-and-await',
        })
    }

    waitForSync: ContentSharingInterface['waitForSync'] = async () => {
        await this._executingPendingActions
        await this._processingUserMessage
    }

    async scheduleAction(
        action: ContentSharingAction,
        options: {
            queueInteraction: ContentSharingQueueInteraction
        },
    ) {
        await this._queingAction

        if (options.queueInteraction === 'skip-queue') {
            await this.executeAction(action)
            return
        }

        this._hasPendingActions = true
        this._queingAction = createResolvable()
        await this.storage.queueAction({ action })
        this._queingAction.resolve()
        delete this._queingAction

        const executePendingActions = this.executePendingActions()
        if (options.queueInteraction === 'queue-and-await') {
            await executePendingActions
        }
        executePendingActions.catch((e) => {
            console.error(
                `Error while executing action ${action.type} (retry scheduled):`,
            )
            console.error(e)
        })
    }

    executePendingActions = async () => {
        await this._executingPendingActions

        const executingPendingActions = (this._executingPendingActions = createResolvable())
        if (this._pendingActionsRetry) {
            this._pendingActionsRetry.resolve()
            delete this._pendingActionsRetry
        }

        try {
            while (true) {
                await this._queingAction

                const action = await this.storage.peekAction()
                if (!action) {
                    break
                }

                await this.executeAction(action)
                await this.storage.removeAction({ actionId: action.id })
            }
            this._hasPendingActions = false
            executingPendingActions.resolve({ result: 'success' })
        } catch (e) {
            this._pendingActionsRetry = createResolvable()
            executingPendingActions.resolve({ result: 'error' })
            this._scheduledRetry = async () => {
                delete this._scheduledRetry
                delete this._scheduledRetryTimeout
                await this.executePendingActions()
            }
            this._scheduledRetryTimeout = setTimeout(
                this._scheduledRetry,
                this.ACTION_RETRY_INTERVAL,
            )
            throw e
        } finally {
            delete this._executingPendingActions
        }
    }

    async forcePendingActionsRetry() {
        await this._scheduledRetry()
    }

    async executeAction(action: ContentSharingAction) {
        const { contentSharing } = await this.options.getServerStorage()
        const userId = (await this.options.auth.authService.getCurrentUser())
            ?.id
        if (!userId) {
            throw new Error(
                `Tried to execute sharing action without being authenticated`,
            )
        }

        const userReference = {
            type: 'user-reference' as 'user-reference',
            id: userId,
        }
        if (action.type === 'add-shared-list-entries') {
            await contentSharing.createListEntries({
                listReference: contentSharing.getSharedListReferenceFromLinkID(
                    action.remoteListId,
                ),
                listEntries: action.data.map((entry) => ({
                    ...entry,
                    entryTitle: entry.entryTitle ?? null,
                })),
                userReference,
            })

            this.options.analytics.trackEvent({
                category: 'ContentSharing',
                action: 'shareListEntryBatch',
                value: { size: action.data.length },
            })
        } else if (action.type === 'remove-shared-list-entry') {
            await contentSharing.removeListEntries({
                listReference: contentSharing.getSharedListReferenceFromLinkID(
                    action.remoteListId,
                ),
                normalizedUrl: action.normalizedUrl,
            })

            this.options.analytics.trackEvent({
                category: 'ContentSharing',
                action: 'unshareListEntry',
            })
        } else if (action.type === 'remove-shared-annotation-list-entries') {
            await contentSharing.removeAnnotationsFromLists({
                sharedListReferences: [
                    contentSharing.getSharedListReferenceFromLinkID(
                        action.remoteListId,
                    ),
                ],
                sharedAnnotationReferences: action.remoteAnnotationIds.map(
                    (remoteId) =>
                        contentSharing.getSharedAnnotationReferenceFromLinkID(
                            remoteId,
                        ),
                ),
            })
        } else if (action.type === 'change-shared-list-title') {
            if (action.newTitle) {
                // Check whether newTitle is actually present, because there was a bug
                // that queued a name change on any change to the list,
                // even if there was no name change
                await contentSharing.updateListTitle(
                    contentSharing.getSharedListReferenceFromLinkID(
                        action.remoteListId,
                    ),
                    action.newTitle,
                )
            }
        } else if (action.type === 'share-annotations') {
            const remoteListIds = await Promise.all(
                action.localListIds.map((localId) =>
                    this.storage.getRemoteListId({ localId }),
                ),
            )
            const {
                sharedAnnotationReferences,
            } = await contentSharing.createAnnotations({
                creator: { type: 'user-reference', id: userId },
                // listReferences: [],
                listReferences: remoteListIds.map((remoteId) =>
                    contentSharing.getSharedListReferenceFromLinkID(remoteId),
                ),
                annotationsByPage: action.data,
            })

            const remoteIds: { [localId: string]: string } = {}
            for (const [localId, sharedAnnotationReference] of Object.entries(
                sharedAnnotationReferences,
            )) {
                remoteIds[localId] = contentSharing.getSharedAnnotationLinkID(
                    sharedAnnotationReference,
                )
            }
            await this.storage.storeAnnotationMetadata(
                Object.entries(sharedAnnotationReferences).map(
                    ([localId, sharedAnnotationReference]) => ({
                        localId,
                        remoteId: contentSharing.getSharedAnnotationLinkID(
                            sharedAnnotationReference,
                        ),
                        excludeFromLists: true,
                    }),
                ),
            )
        } else if (action.type === 'add-annotation-entries') {
            await contentSharing.addAnnotationsToLists({
                creator: userReference,
                sharedListReferences: action.remoteListIds.map((id) =>
                    contentSharing.getSharedListReferenceFromLinkID(id),
                ),
                sharedAnnotations: action.remoteAnnotations.map(
                    (annotation) => ({
                        createdWhen: annotation.createdWhen,
                        normalizedPageUrl: annotation.normalizedPageUrl,
                        reference: contentSharing.getSharedAnnotationReferenceFromLinkID(
                            annotation.remoteId,
                        ),
                    }),
                ),
            })
        } else if (action.type === 'update-annotation-comment') {
            await contentSharing.updateAnnotationComment({
                sharedAnnotationReference: contentSharing.getSharedAnnotationReferenceFromLinkID(
                    action.remoteAnnotationId,
                ),
                updatedComment: action.updatedComment,
            })
        } else if (action.type === 'unshare-annotations') {
            await contentSharing.removeAnnotations({
                sharedAnnotationReferences: action.remoteAnnotationIds.map(
                    (remoteAnnotationId) =>
                        contentSharing.getSharedAnnotationReferenceFromLinkID(
                            remoteAnnotationId,
                        ),
                ),
            })
        } else if (action.type === 'ensure-page-info') {
            for (const pageInfo of action.data) {
                if (this._ensuredPages[pageInfo.normalizedUrl]) {
                    return
                }
                const pageReference = await contentSharing.ensurePageInfo({
                    pageInfo: {
                        ...pageInfo,
                        fullTitle: pageInfo.fullTitle ?? null,
                    },
                    creatorReference: userReference,
                })
                this._ensuredPages[
                    pageInfo.normalizedUrl
                ] = contentSharing.getSharedPageInfoLinkID(pageReference)
                this.options.activityStreams.backend
                    .followEntity({
                        entityType: 'sharedPageInfo',
                        entity: pageReference,
                        feeds: { home: true },
                    })
                    .catch((err) => {
                        console.error('Error following page: ', err.message)
                    })
            }
        }
    }

    async _scheduleAddAnnotationEntries(params: {
        annotations: Annotation[]
        remoteListIds: string[]
        queueInteraction: ContentSharingQueueInteraction
    }) {
        const annotationsByPageUrl: {
            [annotationUrl: string]: { pageUrl: string; createdWhen?: Date }
        } = fromPairs(
            params.annotations.map((annotation) => [
                annotation.url,
                annotation,
            ]),
        )
        const annotationMetadata = await this.storage.getRemoteAnnotationMetadata(
            {
                localIds: params.annotations.map(
                    (annotation) => annotation.url,
                ),
            },
        )
        const remoteAnnotations = Object.entries(annotationMetadata)
            .filter(([, metadata]) => !metadata.excludeFromLists)
            .map(([localId, { remoteId }]) => ({
                normalizedPageUrl: annotationsByPageUrl[localId].pageUrl,
                remoteId,
                createdWhen:
                    annotationsByPageUrl[localId].createdWhen?.getTime() ??
                    Date.now(),
            }))

        await this.scheduleAction(
            {
                type: 'add-annotation-entries',
                remoteListIds: params.remoteListIds,
                remoteAnnotations,
            },
            { queueInteraction: params.queueInteraction },
        )
    }

    async handlePostStorageChange(
        event: StorageOperationEvent<'post'>,
        options: {
            source: 'sync' | 'local'
        },
    ) {
        if (options.source === 'sync' && !this.shouldProcessSyncChanges) {
            return
        }

        for (const change of event.info.changes) {
            if (change.type === 'create') {
                if (change.collection === 'pageListEntries') {
                    await this._processCreatedListEntry(change)
                }
            } else if (change.type === 'modify') {
                if (change.collection === 'customLists') {
                    await this._processModifiedList(change)
                } else if (change.collection === 'annotations') {
                    await this._processModifiedAnnotation(change)
                }
            } else if (change.type === 'delete') {
                if (change.collection === 'pageListEntries') {
                    await this._processDeletedListEntryies(change)
                } else if (change.collection === 'annotations') {
                    await this._processDeletedAnnotation(change)
                }
            }
        }
    }

    async _processCreatedListEntry(change: CreationStorageChange<'post'>) {
        const listEntry = change.values as Pick<PageListEntry, 'fullUrl'>
        const [localListId, pageUrl] = change.pk as [number, string]
        const remoteListId = await this.storage.getRemoteListId({
            localId: localListId,
        })
        if (!remoteListId) {
            return
        }

        const pageTitles = await this.storage.getPageTitles({
            normalizedPageUrls: [pageUrl],
        })
        const pageTitle = pageTitles[pageUrl]

        const originalUrl = 'https://' + normalizeUrl(listEntry.fullUrl)
        await this.scheduleAction(
            {
                type: 'ensure-page-info',
                data: [
                    {
                        createdWhen: '$now',
                        normalizedUrl: pageUrl,
                        originalUrl,
                        fullTitle: pageTitle,
                    },
                ],
            },
            {
                queueInteraction: 'queue-and-return',
            },
        )
        await this.scheduleAction(
            {
                type: 'add-shared-list-entries',
                localListId,
                remoteListId,
                data: [
                    {
                        createdWhen: Date.now(),
                        entryTitle: pageTitle,
                        normalizedUrl: pageUrl,
                        originalUrl,
                    },
                ],
            },
            { queueInteraction: 'queue-and-return' },
        )

        const annotationEntries = await this.options.annotationStorage.listAnnotationsByPageUrl(
            {
                pageUrl,
            },
        )

        await this._scheduleAddAnnotationEntries({
            annotations: annotationEntries,
            remoteListIds: [remoteListId],
            queueInteraction: 'queue-and-return',
        })

        this.remoteEmitter.emit('pageAddedToSharedList', {
            pageUrl,
        })
    }

    async _processModifiedList(change: ModificationStorageChange<'post'>) {
        for (const pk of change.pks) {
            if (!change.updates.name) {
                continue
            }

            const localListId = pk as number
            const remoteListId = await this.storage.getRemoteListId({
                localId: localListId,
            })
            if (!remoteListId) {
                continue
            }

            await this.scheduleAction(
                {
                    type: 'change-shared-list-title',
                    localListId,
                    remoteListId,
                    newTitle: change.updates.name,
                },
                {
                    queueInteraction: 'queue-and-return',
                },
            )
        }
    }

    async _processModifiedAnnotation(
        change: ModificationStorageChange<'post'>,
    ) {
        if (!change.updates.comment) {
            return
        }

        const remoteAnnotationIds = await this.storage.getRemoteAnnotationIds({
            localIds: change.pks as string[],
        })
        if (!Object.keys(remoteAnnotationIds).length) {
            return
        }
        for (const [localAnnotationId, remoteAnnotationId] of Object.entries(
            remoteAnnotationIds,
        )) {
            await this.scheduleAction(
                {
                    type: 'update-annotation-comment',
                    localAnnotationId,
                    remoteAnnotationId: remoteAnnotationId as string,
                    updatedComment: change.updates.comment,
                },
                {
                    queueInteraction: 'queue-and-return',
                },
            )
        }
    }

    async _processDeletedListEntryies(change: DeletionStorageChange<'post'>) {
        for (const pk of change.pks) {
            const [localListId, pageUrl] = pk as [number, string]
            const remoteListId = await this.storage.getRemoteListId({
                localId: localListId,
            })
            if (!remoteListId) {
                continue
            }

            await this.scheduleAction(
                {
                    type: 'remove-shared-list-entry',
                    localListId,
                    remoteListId,
                    normalizedUrl: pageUrl,
                },
                {
                    queueInteraction: 'queue-and-return',
                },
            )

            const annotations = await this.options.annotationStorage.listAnnotationsByPageUrl(
                { pageUrl },
            )
            if (!annotations.length) {
                continue
            }

            const localAnnotationIds = annotations.map((annot) => annot.url)

            const remoteAnnotationIdMap = await this.storage.getRemoteAnnotationIds(
                { localIds: localAnnotationIds },
            )

            await this.scheduleAction(
                {
                    type: 'remove-shared-annotation-list-entries',
                    remoteListId,
                    remoteAnnotationIds: Object.values(remoteAnnotationIdMap),
                },
                {
                    queueInteraction: 'queue-and-return',
                },
            )

            this.remoteEmitter.emit('pageRemovedFromSharedList', {
                pageUrl,
            })
        }
    }

    async _processDeletedAnnotation(change: DeletionStorageChange<'post'>) {
        const localAnnotationIds = change.pks.map((pk) => pk.toString())
        const remoteAnnotationIdMap = await this.storage.getRemoteAnnotationIds(
            { localIds: localAnnotationIds },
        )
        if (!Object.keys(remoteAnnotationIdMap).length) {
            return
        }

        await this.scheduleAction(
            {
                type: 'unshare-annotations',
                remoteAnnotationIds: Object.values(remoteAnnotationIdMap),
            },
            {
                queueInteraction: 'queue-and-return',
            },
        )
    }

    _processUserMessage: UserMessageEvents['message'] = async (event) => {
        await this._processingUserMessage
        const processingUserMessage = createResolvable()
        this._processingUserMessage = processingUserMessage

        try {
            const { message } = event
            if (message.type === 'joined-collection') {
                await this._processJoinedCollection({
                    type: 'shared-list-reference',
                    id: message.sharedListId,
                })
            } else if (message.type === 'created-annotation') {
                await this._processCreatedAnnotation({
                    type: 'shared-annotation-reference',
                    id: message.sharedAnnotationId,
                })
            }
        } catch (e) {
            processingUserMessage.reject(e)
            throw e
        } finally {
            processingUserMessage.resolve()
            delete this._processUserMessage
        }
    }

    private async _processJoinedCollection(listReference: SharedListReference) {
        const { contentSharing } = await this.options.getServerStorage()
        const sharedList = await contentSharing.getListByReference(
            listReference,
        )
        if (!sharedList) {
            return // assume the list was deleted after the user joined it
        }
        const remoteId = listReference.id.toString()
        if (await this.storage.getLocalListId({ remoteId })) {
            return
        }

        const localId = Date.now()
        await this.storage.storeListId({
            localId,
            remoteId,
        })

        // TODO: What if there already exists a list with this name?
        await this.options.customLists.insertCustomList({
            id: localId,
            name: sharedList.title,
        })
    }

    private async _processCreatedAnnotation(
        reference: SharedAnnotationReference,
    ) {
        const { contentSharing } = await this.options.getServerStorage()
        const annotationDetails = await contentSharing.getAnnotation({
            reference,
        })
        if (!annotationDetails) {
            return // assume the annotation was deleted after the user created it
        }
        const { annotation } = annotationDetails

        const localId = annotationUtils.generateUrl({
            pageUrl: annotation.normalizedPageUrl,
            now: () => annotation.createdWhen,
        })

        await this.storage.storeAnnotationMetadata([
            {
                localId,
                remoteId: reference.id as string,
                excludeFromLists: false,
            },
        ])

        await this.options.annotationStorage.createAnnotation({
            url: localId,
            body: annotation.body,
            comment: annotation.comment,
            pageUrl: annotation.normalizedPageUrl,
            createdWhen: new Date(annotation.createdWhen),
        })
    }
}
