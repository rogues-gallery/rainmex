import { Annotation } from 'src/annotations/types'
import { SaveAndRenderHighlightDeps } from 'src/highlighting/ui/highlight-interactions'
import { AnnotationClickHandler } from './ui/types'

export type SelectorDescriptorType =
    | 'TextPositionSelector'
    | 'RangeSelector'
    | 'TextQuoteSelector'

export interface Descriptor {
    strategy: string
    content: any[]
}

export interface Anchor {
    quote: string
    descriptor: Descriptor
}

export type Highlight = Pick<Annotation, 'url' | 'selector'> & {
    temporary?: boolean
    domElements?: HighlightElement[]
}

export type HighlightElement = HTMLElement

export interface HighlightInteractionsInterface {
    renderHighlights: (
        highlights: Highlight[],
        openSidebar: AnnotationClickHandler,
    ) => Promise<Highlight[]>
    renderHighlight: (
        highlight: Highlight,
        openSidebar: AnnotationClickHandler,
        temporary?: boolean,
    ) => Promise<Highlight>
    scrollToHighlight: ({ url }: Highlight) => number
    highlightAndScroll: (annotation: Annotation) => number
    attachEventListenersToNewHighlights: (
        highlight: Highlight,
        openSidebar: AnnotationClickHandler,
    ) => void
    removeMediumHighlights: () => void
    removeTempHighlights: () => void
    makeHighlightMedium: ({ url }: Highlight) => void
    makeHighlightDark: ({ url }: Highlight) => void
    removeHighlights: (args?: { onlyRemoveDarkHighlights?: boolean }) => void
    sortAnnotationsByPosition: (annotations: Annotation[]) => Annotation[]
    _removeHighlight: (highlight: Element) => void
    removeAnnotationHighlight: (url: string) => void
    removeAnnotationHighlights: (urls: string[]) => void
    saveAndRenderHighlight: (
        params: SaveAndRenderHighlightDeps,
    ) => Promise<void>
    saveAndRenderHighlightAndEditInSidebar: (
        params: SaveAndRenderHighlightDeps,
    ) => Promise<void>
}
