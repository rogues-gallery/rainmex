import { browser } from 'webextension-polyfill-ts'
import { TestLogicContainer } from 'ui-logic-core/lib/testing'

import {
    UILogicTestDevice,
    insertBackgroundFunctionTab,
} from 'src/tests/ui-logic-tests'
import { DashboardLogic } from './logic'
import { Events, RootState } from './types'
import * as DATA from './logic.test.data'
import {
    StandardSearchResponse,
    AnnotationsSearchResponse,
} from 'src/search/background/types'
import { FakeAnalytics } from 'src/analytics/mock'
import { createServices } from 'src/services/ui'

type DataSeeder = (
    logic: TestLogicContainer<RootState, Events>,
    device: UILogicTestDevice,
) => Promise<void>
type DataSeederCreator<
    T = StandardSearchResponse | AnnotationsSearchResponse
> = (data?: T) => DataSeeder

export const setPageSearchResult: DataSeederCreator<StandardSearchResponse> = (
    result = DATA.PAGE_SEARCH_RESULT_1,
) => async (logic, { storageManager }) => {
    for (const page of result.docs) {
        await storageManager.collection('pages').createObject({
            url: page.url,
            title: page.title,
        })

        for (const annot of page.annotations) {
            await storageManager.collection('annotations').createObject({
                ...annot,
            })
        }

        for (const tag of page.tags) {
            await storageManager.collection('tags').createObject({
                name: tag,
                url: page.url,
            })
        }

        if (page.hasBookmark) {
            await storageManager.collection('bookmarks').createObject({
                url: page.url,
                time: Date.now(),
            })
        }
    }
    logic.processEvent('setPageSearchResult', { result })
}

export const setNoteSearchResult: DataSeederCreator<AnnotationsSearchResponse> = (
    result = DATA.ANNOT_SEARCH_RESULT_2,
) => async (logic, { storageManager }) => {
    for (const page of result.docs) {
        await storageManager.collection('pages').createObject({
            url: page.url,
            title: page.title,
        })

        for (const annot of page.annotations) {
            await storageManager.collection('annotations').createObject({
                ...annot,
            })
        }

        for (const tag of page.tags) {
            await storageManager.collection('tags').createObject({
                name: tag,
                url: page.url,
            })
        }

        if (page.hasBookmark) {
            await storageManager.collection('bookmarks').createObject({
                url: page.url,
                time: Date.now(),
            })
        }
    }
    logic.processEvent('setAnnotationSearchResult', { result })
}

const defaultTestSetupDeps = {
    copyToClipboard: () => undefined,
}

export async function setupTest(
    device: UILogicTestDevice,
    args: {
        withAuth?: boolean
        withBeta?: boolean
        mockDocument?: any
        seedData?: DataSeeder
        overrideSearchTrigger?: boolean
        openFeedUrl?: () => void
        copyToClipboard?: (text: string) => Promise<boolean>
        renderDashboardSwitcherLink?: () => JSX.Element
        renderUpdateNotifBanner?: () => JSX.Element
    } = {
        copyToClipboard: defaultTestSetupDeps.copyToClipboard,
    },
) {
    const analytics = new FakeAnalytics()

    if (args.withAuth) {
        device.backgroundModules.auth.remoteFunctions.getCurrentUser = async () => ({
            id: 'test-user',
            displayName: 'test',
            email: 'test@test.com',
            emailVerified: true,
        })
    }

    if (args.withBeta) {
        device.backgroundModules.auth.remoteFunctions.isAuthorizedForFeature = async (
            feature,
        ) => feature === 'beta'
    }

    const logic = new DashboardLogic({
        location,
        analytics,
        annotationsBG: insertBackgroundFunctionTab(
            device.backgroundModules.directLinking.remoteFunctions,
        ) as any,
        localStorage: browser.storage.local,
        authBG: device.backgroundModules.auth.remoteFunctions,
        tagsBG: device.backgroundModules.tags.remoteFunctions,
        document: args.mockDocument,
        listsBG: {
            ...device.backgroundModules.customLists.remoteFunctions,
            insertPageToList: (fnArgs) =>
                device.backgroundModules.customLists.remoteFunctions.insertPageToList(
                    { ...fnArgs, skipPageIndexing: true },
                ),
        },
        searchBG: device.backgroundModules.search.remoteFunctions.search,
        syncBG: device.backgroundModules.sync.remoteFunctions,
        backupBG: insertBackgroundFunctionTab(
            device.backgroundModules.backupModule.remoteFunctions,
        ) as any,
        contentShareBG: device.backgroundModules.contentSharing.remoteFunctions,
        contentConversationsBG:
            device.backgroundModules.contentConversations.remoteFunctions,
        activityIndicatorBG:
            device.backgroundModules.activityIndicator.remoteFunctions,
        copyToClipboard:
            args.copyToClipboard ?? defaultTestSetupDeps.copyToClipboard,
        openFeed: args.openFeedUrl ?? (() => undefined),
        openCollectionPage: () => {},
        renderDashboardSwitcherLink:
            args.renderDashboardSwitcherLink ?? (() => null),
        renderUpdateNotifBanner: args.renderUpdateNotifBanner ?? (() => null),
        services: createServices(),
    })

    if (args.overrideSearchTrigger) {
        logic['searchTriggeredCount'] = 0

        logic['runSearch'] = (async () => {
            logic['searchTriggeredCount']++
        }) as any
    }

    const searchResults = device.createElement<RootState, Events>(logic)

    if (args.seedData) {
        await args.seedData(searchResults, device)
    }

    return { searchResults, logic, analytics }
}
