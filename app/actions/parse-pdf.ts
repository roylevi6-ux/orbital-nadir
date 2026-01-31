'use server';

// Use pdf2json which is designed for server-side Node.js usage
// No workers, no browser dependencies
import PDFParser from 'pdf2json';

export interface PdfTextItem {
    text: string;
    x: number;
    y: number;
}

export interface PdfParseResult {
    text: string;
    items: PdfTextItem[];
    numpages: number;
    info: Record<string, unknown>;
}

export async function parsePdfServerAction(formData: FormData): Promise<PdfParseResult> {
    const file = formData.get('file') as File;

    if (!file) {
        throw new Error('No file provided');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('[PDF Parse] Starting PDF extraction for:', file.name, 'size:', buffer.length, 'bytes');

    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdfParser.on('pdfParser_dataError', (errData: any) => {
            console.error('[PDF Parse] pdf2json error:', errData);
            reject(new Error(errData?.parserError?.message || errData?.parserError || 'PDF parsing failed'));
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
            try {
                // Extract text with position info from all pages
                let fullText = '';
                const items: PdfTextItem[] = [];
                let pageCount = 0;

                if (pdfData && pdfData.Pages) {
                    pageCount = pdfData.Pages.length;
                    console.log('[PDF Parse] Found', pageCount, 'pages');

                    for (let pageIdx = 0; pageIdx < pdfData.Pages.length; pageIdx++) {
                        const page = pdfData.Pages[pageIdx];
                        // Add page offset to y coordinate to keep items from different pages separate
                        const pageYOffset = pageIdx * 1000;

                        if (page.Texts) {
                            console.log('[PDF Parse] Page', pageIdx + 1, 'has', page.Texts.length, 'text items');

                            for (const textItem of page.Texts) {
                                if (textItem.R) {
                                    for (const run of textItem.R) {
                                        if (run.T) {
                                            const decodedText = decodeURIComponent(run.T);
                                            fullText += decodedText + ' ';
                                            items.push({
                                                text: decodedText,
                                                x: textItem.x || 0,
                                                y: (textItem.y || 0) + pageYOffset
                                            });
                                        }
                                    }
                                }
                            }
                        }
                        fullText += '\n';
                    }
                }

                console.log('[PDF Parse] Extracted', items.length, 'text items, total text length:', fullText.length);

                // Log sample of extracted text for debugging
                if (fullText.length > 0) {
                    console.log('[PDF Parse] Sample text (first 500 chars):', fullText.substring(0, 500));
                }

                resolve({ text: fullText, items, numpages: pageCount, info: {} });
            } catch (e: unknown) {
                console.error('[PDF Parse] Error processing PDF data:', e);
                reject(new Error('Failed to extract text: ' + (e instanceof Error ? e.message : 'Unknown error')));
            }
        });

        // Parse the buffer
        pdfParser.parseBuffer(buffer);
    });
}
