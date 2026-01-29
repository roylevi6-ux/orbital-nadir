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

    try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Parse PDF using pdf2json
        const result = await new Promise<{ text: string; items: PdfTextItem[]; numpages: number }>((resolve, reject) => {
            const pdfParser = new PDFParser();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pdfParser.on('pdfParser_dataError', (errData: any) => {
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
                        for (let pageIdx = 0; pageIdx < pdfData.Pages.length; pageIdx++) {
                            const page = pdfData.Pages[pageIdx];
                            // Add page offset to y coordinate to keep items from different pages separate
                            const pageYOffset = pageIdx * 1000;

                            if (page.Texts) {
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
                    resolve({ text: fullText, items, numpages: pageCount });
                } catch (e: unknown) {
                    reject(new Error('Failed to extract text: ' + (e instanceof Error ? e.message : 'Unknown error')));
                }
            });

            // Parse the buffer
            pdfParser.parseBuffer(buffer);
        });

        return {
            text: result.text,
            items: result.items,
            numpages: result.numpages,
            info: {}
        };
    } catch (error: unknown) {
        console.error('PDF Parse Error:', error);
        throw new Error('Failed to parse PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}
