import 'core-js'
import { EventEmitter } from 'events'
import { normalizeUrl } from '@worldbrain/memex-url-utils'

import { setupScrollReporter } from 'src/activity-logger/content_script'
import { setupPageContentRPC } from 'src/page-analysis/content_script'
import { shouldIncludeSearchInjection } from 'src/search-injection/detection'
import {
    loadAnnotationWhenReady,
    setupRemoteDirectLinkFunction,
} from 'src/annotations/content_script'
import {
    remoteFunction,
    runInBackground,
    RemoteFunctionRegistry,
    makeRemotelyCallableType,
    setupRpcConnection,
} from 'src/util/webextensionRPC'
import { Resolvable, resolvablePromise } from 'src/util/resolvable'
import { ContentScriptRegistry } from './types'
import { ContentScriptsInterface } from '../background/types'
import { ContentScriptComponent } from '../types'
import { initKeyboardShortcuts } from 'src/in-page-ui/keyboard-shortcuts/content_script'
import { InPageUIContentScriptRemoteInterface } from 'src/in-page-ui/content_script/types'
import AnnotationsManager from 'src/annotations/annotations-manager'
import { HighlightRenderer } from 'src/highlighting/ui/highlight-interactions'
import { RemoteTagsInterface } from 'src/tags/background/types'
import { AnnotationInterface } from 'src/annotations/background/types'
import ToolbarNotifications from 'src/toolbar-notification/content_script'
import * as tooltipUtils from 'src/in-page-ui/tooltip/utils'
import * as sidebarUtils from 'src/sidebar-overlay/utils'
import * as constants from '../constants'
import { SharedInPageUIState } from 'src/in-page-ui/shared-state/shared-in-page-ui-state'
import { AnnotationsSidebarInPageEventEmitter } from 'src/sidebar/annotations-sidebar/types'
import { createAnnotationsCache } from 'src/annotations/annotations-cache'
import { AnalyticsEvent } from 'src/analytics/types'
import analytics from 'src/analytics'
import { main as highlightMain } from 'src/content-scripts/content_script/highlights'
import { main as searchInjectionMain } from 'src/content-scripts/content_script/search-injection'
import { PageIndexingInterface } from 'src/page-indexing/background/types'
import { copyToClipboard } from 'src/annotations/content_script/utils'
import { getUrl } from 'src/util/uri-utils'
import { browser } from 'webextension-polyfill-ts'
import { copyPaster, subscription } from 'src/util/remote-functions-background'

// Content Scripts are separate bundles of javascript code that can be loaded
// on demand by the browser, as needed. This main function manages the initialisation
// and dependencies of content scripts.

export async function main({ loadRemotely } = { loadRemotely: true }) {
    setupRpcConnection({ sideName: 'content-script-global', role: 'content' })

    setupPageContentRPC()
    runInBackground<PageIndexingInterface<'caller'>>().setTabAsIndexable()

    const getPageUrl = () => getUrl(window.location.href)
    const getPageTitle = () => document.title
    const getNormalizedPageUrl = () => normalizeUrl(getPageUrl())

    // 1. Create a local object with promises to track each content script
    // initialisation and provide a function which can initialise a content script
    // or ignore if already loaded.
    const components: {
        ribbon?: Resolvable<void>
        sidebar?: Resolvable<void>
        tooltip?: Resolvable<void>
        highlights?: Resolvable<void>
    } = {}

    // 2. Initialise dependencies required by content scripts
    const annotationsBG = runInBackground<AnnotationInterface<'caller'>>()
    const tagsBG = runInBackground<RemoteTagsInterface>()
    const remoteFunctionRegistry = new RemoteFunctionRegistry()
    const annotationsManager = new AnnotationsManager()
    const toolbarNotifications = new ToolbarNotifications()
    toolbarNotifications.registerRemoteFunctions(remoteFunctionRegistry)
    const highlightRenderer = new HighlightRenderer()
    const annotationEvents = new EventEmitter() as AnnotationsSidebarInPageEventEmitter

    const annotationsCache = createAnnotationsCache({
        tags: tagsBG,
        annotations: annotationsBG,
        contentSharing: runInBackground(),
    })

    // 3. Creates an instance of the InPageUI manager class to encapsulate
    // business logic of initialising and hide/showing components.
    const inPageUI = new SharedInPageUIState({
        getNormalizedPageUrl,
        loadComponent: (component) => {
            // Treat highlights differently as they're not a separate content script
            if (component === 'highlights') {
                components.highlights = resolvablePromise<void>()
                components.highlights.resolve()
            }

            if (!components[component]) {
                components[component] = resolvablePromise<void>()
                loadContentScript(component)
            }
            return components[component]!
        },
        unloadComponent: (component) => {
            delete components[component]
        },
    })
    const loadAnnotationsPromise = annotationsCache.load(getPageUrl())

    const annotationFunctionsParams = {
        inPageUI,
        annotationsCache,
        getSelection: () => document.getSelection(),
        getUrlAndTitle: () => ({
            title: getPageTitle(),
            pageUrl: getPageUrl(),
        }),
    }

    const annotationsFunctions = {
        createHighlight: (
            analyticsEvent?: AnalyticsEvent<'Highlights'>,
        ) => () =>
            highlightRenderer.saveAndRenderHighlight({
                ...annotationFunctionsParams,
                analyticsEvent,
            }),
        createAnnotation: (
            analyticsEvent?: AnalyticsEvent<'Annotations'>,
        ) => () =>
            highlightRenderer.saveAndRenderHighlightAndEditInSidebar({
                ...annotationFunctionsParams,
                analyticsEvent,
            }),
    }

    // 4. Create a contentScriptRegistry object with functions for each content script
    // component, that when run, initialise the respective component with it's
    // dependencies
    const contentScriptRegistry: ContentScriptRegistry = {
        async registerRibbonScript(execute): Promise<void> {
            await execute({
                inPageUI,
                annotationsManager,
                getRemoteFunction: remoteFunction,
                highlighter: highlightRenderer,
                annotations: annotationsBG,
                annotationsCache,
                tags: tagsBG,
                customLists: runInBackground(),
                contentSharing: runInBackground(),
                bookmarks: runInBackground(),
                tooltip: {
                    getState: tooltipUtils.getTooltipState,
                    setState: tooltipUtils.setTooltipState,
                },
                highlights: {
                    getState: tooltipUtils.getHighlightsState,
                    setState: tooltipUtils.setHighlightsState,
                },
                getPageUrl,
            })
            components.ribbon?.resolve()
        },
        async registerHighlightingScript(execute): Promise<void> {
            await execute({
                inPageUI,
                annotationsCache,
                highlightRenderer,
                annotations: annotationsBG,
                annotationsManager,
            })
            components.highlights?.resolve()
        },
        async registerSidebarScript(execute): Promise<void> {
            await execute({
                events: annotationEvents,
                initialState: inPageUI.componentsShown.sidebar
                    ? 'visible'
                    : 'hidden',
                inPageUI,
                annotationsCache,
                highlighter: highlightRenderer,
                annotations: annotationsBG,
                tags: tagsBG,
                auth: runInBackground(),
                customLists: runInBackground(),
                contentSharing: runInBackground(),
                searchResultLimit: constants.SIDEBAR_SEARCH_RESULT_LIMIT,
                analytics,
                copyToClipboard,
                getPageUrl,
                copyPaster,
                subscription,
                contentConversationsBG: runInBackground(),
                contentScriptBackground: runInBackground(),
            })
            components.sidebar?.resolve()
        },
        async registerTooltipScript(execute): Promise<void> {
            await execute({
                inPageUI,
                toolbarNotifications,
                createHighlight: annotationsFunctions.createHighlight({
                    category: 'Highlights',
                    action: 'createFromTooltip',
                }),
                createAnnotation: annotationsFunctions.createAnnotation({
                    category: 'Annotations',
                    action: 'createFromTooltip',
                }),
            })
            components.tooltip?.resolve()
        },
        async registerSearchInjectionScript(execute): Promise<void> {
            await execute({
                requestSearcher: remoteFunction('search'),
            })
        },
    }

    window['contentScriptRegistry'] = contentScriptRegistry

    // N.B. Building the highlighting script as a seperate content script results in ~6Mb of duplicated code bundle,
    // so it is included in this global content script where it adds less than 500kb.
    await loadAnnotationsPromise
    await contentScriptRegistry.registerHighlightingScript(highlightMain)

    // 5. Registers remote functions that can be used to interact with components
    // in this tab.
    // TODO:(remote-functions) Move these to the inPageUI class too
    makeRemotelyCallableType<InPageUIContentScriptRemoteInterface>({
        showSidebar: inPageUI.showSidebar.bind(inPageUI),
        showRibbon: inPageUI.showRibbon.bind(inPageUI),
        reloadRibbon: () => inPageUI.reloadRibbon(),
        insertRibbon: async () => inPageUI.loadComponent('ribbon'),
        removeRibbon: async () => inPageUI.removeRibbon(),
        insertOrRemoveRibbon: async () => inPageUI.toggleRibbon(),
        updateRibbon: async () => inPageUI.updateRibbon(),
        showContentTooltip: async () => inPageUI.showTooltip(),
        insertTooltip: async () => inPageUI.showTooltip(),
        removeTooltip: async () => inPageUI.removeTooltip(),
        insertOrRemoveTooltip: async () => inPageUI.toggleTooltip(),
        goToHighlight: async (annotation, pageAnnotations) => {
            await highlightRenderer.renderHighlights(
                pageAnnotations,
                annotationsBG.toggleSidebarOverlay,
            )
            await highlightRenderer.highlightAndScroll(annotation)
        },
        createHighlight: annotationsFunctions.createHighlight({
            category: 'Highlights',
            action: 'createFromContextMenu',
        }),
        removeHighlights: async () => highlightRenderer.removeHighlights(),
        createAnnotation: annotationsFunctions.createAnnotation({
            category: 'Annotations',
            action: 'createFromContextMenu',
        }),
    })

    // 6. Setup other interactions with this page (things that always run)
    setupScrollReporter()
    loadAnnotationWhenReady()
    setupRemoteDirectLinkFunction({ highlightRenderer })
    initKeyboardShortcuts({
        inPageUI,
        createHighlight: annotationsFunctions.createHighlight({
            category: 'Highlights',
            action: 'createFromShortcut',
        }),
        createAnnotation: annotationsFunctions.createAnnotation({
            category: 'Annotations',
            action: 'createFromShortcut',
        }),
    })
    const loadContentScript = createContentScriptLoader({ loadRemotely })
    if (shouldIncludeSearchInjection(window.location.hostname)) {
        await contentScriptRegistry.registerSearchInjectionScript(
            searchInjectionMain,
        )
    }

    // 7. Load components and associated content scripts if they are set to autoload
    // on each page.
    if (await tooltipUtils.getTooltipState()) {
        await inPageUI.setupTooltip()
    }

    const areHighlightsEnabled = await tooltipUtils.getHighlightsState()
    if (areHighlightsEnabled) {
        inPageUI.showHighlights()
        if (!annotationsCache.isEmpty) {
            inPageUI.loadComponent('sidebar')
        }
    }

    const isSidebarEnabled = await sidebarUtils.getSidebarState()
    if (isSidebarEnabled) {
        await inPageUI.loadComponent('ribbon')
    }

    return inPageUI
}

type ContentScriptLoader = (component: ContentScriptComponent) => Promise<void>
export function createContentScriptLoader(args: { loadRemotely: boolean }) {
    const remoteLoader: ContentScriptLoader = async (
        component: ContentScriptComponent,
    ) => {
        await runInBackground<
            ContentScriptsInterface<'caller'>
        >().injectContentScriptComponent({
            component,
        })
    }

    const localLoader: ContentScriptLoader = async (
        component: ContentScriptComponent,
    ) => {
        const script = document.createElement('script')
        script.src = `../content_script_${component}.js`
        document.body.appendChild(script)
    }

    return args?.loadRemotely ? remoteLoader : localLoader
}

export function loadRibbonOnMouseOver(loadRibbon: () => void) {
    const listener = (event: MouseEvent) => {
        if (event.clientX > window.innerWidth - 200) {
            loadRibbon()
            document.removeEventListener('mousemove', listener)
        }
    }
    document.addEventListener('mousemove', listener)
}
