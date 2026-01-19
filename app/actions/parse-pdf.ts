'use server';

// Use pdfjs-dist legacy build which doesn't require workers
// This avoids the "Cannot find module as expression is too dynamic" error in Next.js
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Disable workers entirely for server-side usage
GlobalWorkerOptions.workerSrc = '';

export async function parsePdfServerAction(formData: FormData) {
    const file = formData.get('file') as File;

    if (!file) {
        throw new Error('No file provided');
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Load the PDF document
        const loadingTask = getDocument({
            data: uint8Array,
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
        });

        const pdfDocument = await loadingTask.promise;
        const numPages = pdfDocument.numPages;

        // Extract text from all pages
        let fullText = '';
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }

        return {
            text: fullText,
            numpages: numPages,
            info: {}
        };
    } catch (error: any) {
        console.error('PDF Parse Error:', error);
        throw new Error('Failed to parse PDF: ' + error.message);
    }
}
