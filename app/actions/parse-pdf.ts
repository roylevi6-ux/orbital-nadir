'use server';

// Use pdf2json which is designed for server-side Node.js usage
// No workers, no browser dependencies
import PDFParser from 'pdf2json';

export async function parsePdfServerAction(formData: FormData) {
    const file = formData.get('file') as File;

    if (!file) {
        throw new Error('No file provided');
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Parse PDF using pdf2json
        const text = await new Promise<string>((resolve, reject) => {
            const pdfParser = new PDFParser();

            pdfParser.on('pdfParser_dataError', (errData: any) => {
                reject(new Error(errData.parserError || 'PDF parsing failed'));
            });

            pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
                try {
                    // Extract text from all pages
                    let fullText = '';
                    if (pdfData && pdfData.Pages) {
                        for (const page of pdfData.Pages) {
                            if (page.Texts) {
                                for (const textItem of page.Texts) {
                                    if (textItem.R) {
                                        for (const run of textItem.R) {
                                            if (run.T) {
                                                // Decode URI-encoded text
                                                fullText += decodeURIComponent(run.T) + ' ';
                                            }
                                        }
                                    }
                                }
                            }
                            fullText += '\n';
                        }
                    }
                    resolve(fullText);
                } catch (e: any) {
                    reject(new Error('Failed to extract text: ' + e.message));
                }
            });

            // Parse the buffer
            pdfParser.parseBuffer(buffer);
        });

        return {
            text: text,
            numpages: 0, // pdf2json doesn't easily expose page count  
            info: {}
        };
    } catch (error: any) {
        console.error('PDF Parse Error:', error);
        throw new Error('Failed to parse PDF: ' + error.message);
    }
}
