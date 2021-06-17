import { browser } from 'webextension-polyfill-ts'
import * as PDFJS from 'pdfjs-dist/es5/build/pdf'
import transformPageText from 'src/util/transform-page-text'

// Run PDF.js to extract text from each page and read document metadata.
async function extractContent(pdfData: ArrayBuffer) {
    // Point PDF.js to its worker code, a static file in the extension.
    PDFJS.GlobalWorkerOptions.workerSrc = browser.extension.getURL(
        '/build/pdf.worker.min.js',
    )

    // Load PDF document into PDF.js
    // @ts-ignore
    const pdf = await PDFJS.getDocument(pdfData).promise

    // Read text from pages one by one (in parallel may be too heavy).
    const pageTexts = []
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        // wait for object containing items array with text pieces
        const pageItems = await page.getTextContent()
        const pageText = pageItems.items.map((item) => item.str).join(' ')
        pageTexts.push(pageText)
    }

    // Run the joined texts through our pipeline
    const { text: processedText } = transformPageText({
        text: pageTexts.join(' '),
    })

    const metadata = await pdf.getMetadata()

    return {
        fullText: processedText,
        author: metadata.info.Author,
        title: metadata.info.Title,
        keywords: metadata.info.Keywords,
    }
}

// Given a PDF as blob or URL, return a promise of its text and metadata.
export default async function extractPdfContent(
    input: { url: string } | { blob: Blob },
) {
    // TODO: If the PDF is open in a Memex PDF Reader, we should be able to save the content from that tab
    // instead of re-fetching it.

    // Fetch document if only a URL is given.
    let blob = 'blob' in input ? input.blob : undefined

    if (!('blob' in input)) {
        const response = await fetch(input.url)

        if (response.status >= 400 && response.status < 600) {
            return Promise.reject(
                new Error(`Bad response from server: ${response.status}`),
            )
        }

        blob = await response.blob()
    }

    const pdfData = await new Promise<ArrayBuffer>(function (resolve, reject) {
        const fileReader = new FileReader()
        fileReader.onload = async (event) => {
            resolve(event.target.result as ArrayBuffer)
        }
        fileReader.onerror = (event) => reject(event.target.error)
        fileReader.readAsArrayBuffer(blob)
    })

    return extractContent(pdfData)
}
