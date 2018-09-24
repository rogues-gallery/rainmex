import { browser, Tabs, Storage } from 'webextension-polyfill-ts'

import { createPageFromTab, Tag } from '../../search'
import { FeatureStorage, ManageableStorage } from '../../search/storage'
import { STORAGE_KEYS as IDXING_PREF_KEYS } from '../../options/settings/constants'
import { Annotation, SearchParams } from '../types'

export interface DirectLinkingStorageProps {
    storageManager: ManageableStorage
    browserStorageArea?: Storage.StorageArea
    directLinksColl?: string
}

export default class DirectLinkingStorage extends FeatureStorage {
    static DIRECT_LINKS_COLL = 'directLinks'
    private _browserStorageArea: Storage.StorageArea
    private _directLinksColl: string

    constructor({
        storageManager,
        browserStorageArea = browser.storage.local,
        directLinksColl = DirectLinkingStorage.DIRECT_LINKS_COLL,
    }: DirectLinkingStorageProps) {
        super(storageManager)
        this._browserStorageArea = browserStorageArea
        this._directLinksColl = directLinksColl

        this.storageManager.registerCollection(this._directLinksColl, [
            {
                version: new Date(2018, 5, 31),
                fields: {
                    pageTitle: { type: 'text' },
                    pageUrl: { type: 'url' },
                    body: { type: 'text' },
                    selector: { type: 'json' },
                    createdWhen: { type: 'datetime' },
                    url: { type: 'string' },
                },
                indices: [
                    { field: 'url', pk: true },
                    { field: 'pageTitle' },
                    { field: 'body' },
                    { field: 'createdWhen' },
                ],
            },
            {
                version: new Date(2018, 7, 3),
                fields: {
                    pageTitle: { type: 'text' },
                    pageUrl: { type: 'url' },
                    body: { type: 'text' },
                    comment: { type: 'text' },
                    selector: { type: 'json' },
                    createdWhen: { type: 'datetime' },
                    lastEdited: { type: 'datetime' },
                    url: { type: 'string' },
                },
                indices: [
                    { field: 'url', pk: true },
                    { field: 'pageTitle' },
                    { field: 'pageUrl' },
                    { field: 'body' },
                    { field: 'createdWhen' },
                    { field: 'comment' },
                ],
            },
        ])
    }

    private async fetchIndexingPrefs(): Promise<{ shouldIndexLinks: boolean }> {
        const storage = await this._browserStorageArea.get(
            IDXING_PREF_KEYS.LINKS,
        )

        return {
            shouldIndexLinks: !!storage[IDXING_PREF_KEYS.LINKS],
        }
    }

    async insertDirectLink({
        pageTitle,
        pageUrl,
        url,
        body,
        selector,
    }: Annotation) {
        await this.storageManager.putObject(this._directLinksColl, {
            pageTitle,
            pageUrl,
            body,
            selector,
            createdWhen: new Date(),
            lastEdited: {},
            url,
            comment: '',
        })
    }

    async indexPageFromTab({ id, url }: Tabs.Tab) {
        const indexingPrefs = await this.fetchIndexingPrefs()

        const page = await createPageFromTab({
            tabId: id,
            url,
            stubOnly: !indexingPrefs.shouldIndexLinks,
        })

        await page.loadRels()

        // Add new visit if none, else page won't appear in results
        // TODO: remove once search changes to incorporate assoc. page data apart from bookmarks/visits
        if (!page.visits.length) {
            page.addVisit()
        }

        await page.save()
    }
}

export interface AnnotationStorageProps {
    storageManager: ManageableStorage
    browserStorageArea?: Storage.StorageArea
    annotationsColl?: string
    tagsColl?: string
}

// TODO: Move to src/annotations in the future
export class AnnotationStorage extends FeatureStorage {
    static ANNOTS_COLL = 'annotations'
    static TAGS_COLL = 'tags'
    private _browserStorageArea: Storage.StorageArea
    private _annotationsColl: string
    private _tagsColl: string

    constructor({
        storageManager,
        browserStorageArea = browser.storage.local,
        annotationsColl = AnnotationStorage.ANNOTS_COLL,
        tagsColl = AnnotationStorage.TAGS_COLL,
    }: AnnotationStorageProps) {
        super(storageManager)
        this._browserStorageArea = browserStorageArea
        this._annotationsColl = annotationsColl
        this._tagsColl = tagsColl

        this.storageManager.registerCollection(this._annotationsColl, {
            version: new Date(2018, 7, 26),
            fields: {
                pageTitle: { type: 'text' },
                pageUrl: { type: 'url' },
                body: { type: 'text' },
                comment: { type: 'text' },
                selector: { type: 'json' },
                createdWhen: { type: 'datetime' },
                lastEdited: { type: 'datetime' },
                url: { type: 'string' },
            },
            indices: [
                { field: 'url', pk: true },
                { field: 'pageTitle' },
                { field: 'body' },
                { field: 'createdWhen' },
                { field: 'comment' },
            ],
        })
    }

    private async fetchIndexingPrefs(): Promise<{ shouldIndexLinks: boolean }> {
        const storage = await this._browserStorageArea.get(
            IDXING_PREF_KEYS.LINKS,
        )

        return {
            shouldIndexLinks: !!storage[IDXING_PREF_KEYS.LINKS],
        }
    }

    async indexPageFromTab({ id, url }: Tabs.Tab) {
        const indexingPrefs = await this.fetchIndexingPrefs()

        const page = await createPageFromTab({
            tabId: id,
            url,
            stubOnly: !indexingPrefs.shouldIndexLinks,
        })

        await page.loadRels()

        // Add new visit if none, else page won't appear in results
        // TODO: remove once search changes to incorporate assoc. page data apart from bookmarks/visits
        if (!page.visits.length) {
            page.addVisit()
        }

        await page.save()
    }

    async getAnnotationByPk(url: string) {
        return this.storageManager.findObject<Annotation>(
            this._annotationsColl,
            {
                url,
            },
        )
    }

    async getAnnotationsByUrl(pageUrl: string) {
        return this.storageManager.findAll<Annotation>(this._annotationsColl, {
            pageUrl,
        })
    }

    async search({
        endDate = Date.now(),
        startDate = 0,
        terms = [],
    }: SearchParams) {
        return this.storageManager.findAll<Annotation>(this._annotationsColl, {
            $or: [
                { _body_terms: { $all: terms } },
                { _comments_terms: { $all: terms } },
                { _pageTitle_terms: { $all: terms } },
            ],
            createdWhen: {
                $lte: endDate,
                $gte: startDate,
            },
        })
    }

    async insertDirectLink({
        pageTitle,
        pageUrl,
        url,
        body,
        selector,
    }: Annotation) {
        await this.storageManager.putObject(this._annotationsColl, {
            pageTitle,
            pageUrl,
            body,
            selector,
            createdWhen: new Date(),
            lastEdited: {},
            url,
            comment: '',
        })
    }

    async createAnnotation({
        pageTitle,
        pageUrl,
        body,
        url,
        comment,
        selector,
    }: Annotation) {
        return this.storageManager.putObject(this._annotationsColl, {
            pageTitle,
            pageUrl,
            comment,
            body,
            selector,
            createdWhen: new Date(),
            lastEdited: {},
            url,
        })
    }

    async editAnnotation(url: string, comment: string) {
        return this.storageManager.updateObject<Annotation>(
            this._annotationsColl,
            { url },
            {
                $set: {
                    comment,
                    lastEdited: new Date(),
                },
            },
        )
    }

    async deleteAnnotation(url: string) {
        return this.storageManager.deleteObject<Annotation>(
            this._annotationsColl,
            {
                url,
            },
        )
    }

    async getTagsByAnnotationUrl(url: string) {
        return this.storageManager.findAll<Tag>(this._tagsColl, {
            url,
        })
    }

    modifyTags = (shouldAdd: boolean) => async (name: string, url: string) => {
        if (shouldAdd) {
            this.storageManager.putObject(this._tagsColl, {
                name,
                url,
            })
        } else {
            this.storageManager.deleteObject<Annotation>(this._tagsColl, {
                name,
                url,
            })
        }
    }
}
