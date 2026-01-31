'use server';

// Use pdf2json which is designed for server-side Node.js usage
// No workers, no browser dependencies
import PDFParser from 'pdf2json';
import pdfParse from 'pdf-parse';

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

    // Try pdf2json first (provides position info)
    try {
        const result = await parsePdfWithPdf2json(buffer);

        console.log('[PDF Parse] pdf2json result: text length:', result.text.length, 'items:', result.items.length);

        // If pdf2json got good results, use them
        if (result.text.trim().length > 50 || result.items.length > 10) {
            return result;
        }

        console.log('[PDF Parse] pdf2json returned minimal content, trying pdf-parse fallback...');
    } catch (error) {
        console.warn('[PDF Parse] pdf2json failed:', error);
    }

    // Fallback to pdf-parse (better compatibility, no position info)
    try {
        const result = await parsePdfWithPdfParse(buffer);
        console.log('[PDF Parse] pdf-parse result: text length:', result.text.length);
        return result;
    } catch (error) {
        console.error('[PDF Parse] pdf-parse also failed:', error);
        throw new Error('Failed to parse PDF with both libraries');
    }
}

async function parsePdfWithPdf2json(buffer: Buffer): Promise<PdfParseResult> {
    return new Promise((resolve, reject) => {
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
                resolve({ text: fullText, items, numpages: pageCount, info: {} });
            } catch (e: unknown) {
                reject(new Error('Failed to extract text: ' + (e instanceof Error ? e.message : 'Unknown error')));
            }
        });

        // Parse the buffer
        pdfParser.parseBuffer(buffer);
    });
}

async function parsePdfWithPdfParse(buffer: Buffer): Promise<PdfParseResult> {
    const data = await pdfParse(buffer);

    console.log('[PDF Parse] pdf-parse extracted:', {
        pages: data.numpages,
        textLength: data.text?.length || 0,
        info: data.info
    });

    // pdf-parse doesn't provide position info, so we create synthetic items
    // by splitting text into lines and words
    const items: PdfTextItem[] = [];
    const lines = (data.text || '').split('\n');

    let y = 0;
    for (const line of lines) {
        const words = line.trim().split(/\s+/);
        let x = 0;
        for (const word of words) {
            if (word.length > 0) {
                items.push({ text: word, x, y });
                x += 5; // Approximate spacing
            }
        }
        y += 1;
    }

    return {
        text: data.text || '',
        items,
        numpages: data.numpages || 0,
        info: data.info || {}
    };
}
