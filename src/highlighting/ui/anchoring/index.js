import * as domTextQuote from 'dom-anchor-text-quote'
import * as domTextPosition from 'dom-anchor-text-position'
import * as hypHTMLAnchoring from './anchoring/html'
import { anchor as PDFAnchor, describe as PDFDescribe } from './anchoring/pdf'
import { highlightDOMRange } from '../highlight-dom-range'

const isPDF = () => {
    return window.location.href.endsWith('.pdf')
}

export async function selectionToDescriptor({ selection }) {
    if (selection === null || selection.isCollapsed) {
        return null
    }

    const range = selection.getRangeAt(0)
    const root = document.body
    const content = isPDF()
        ? await PDFDescribe(root, range)
        : hypHTMLAnchoring.describe(root, range)
    return {
        strategy: 'hyp-anchoring',
        content,
    }
}

export async function descriptorToRange({ descriptor }) {
    const root = document.body

    if (descriptor.strategy === 'dom-anchor-text-quote') {
        return domTextQuote.toRange(root, descriptor.content)
    }
    if (descriptor.strategy === 'hyp-anchoring') {
        if (isPDF()) {
            return PDFAnchor(root, descriptor.content)
        }
        return hypHTMLAnchoring.anchor(root, descriptor.content)
    }

    const rangeFromQuote = domTextQuote.toRange(
        root,
        descriptor.content.textQuote,
    )
    if (!rangeFromQuote) {
        return null
    }
    if (
        !hasAncestor(
            rangeFromQuote.commonAncestorContainer,
            (node) => node.tagName && node.tagName.toLowerCase() === 'script',
        )
    ) {
        return rangeFromQuote
    }

    const rangeFromPosition = domTextPosition.toRange(root, descriptor.content)
    if (!rangeFromPosition) {
        return null
    }
    if (rangeFromPosition.toString() === descriptor.content.string) {
        return rangeFromPosition
    }

    return null
}

export function markRange({ range, cssClass }) {
    return highlightDOMRange(range, cssClass)
}

function hasAncestor(node, test) {
    while (node !== document.body) {
        if (test(node)) {
            return true
        }
        node = node.parentNode
    }

    return false
}
