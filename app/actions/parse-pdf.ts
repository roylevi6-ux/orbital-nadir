'use server';

// Polyfill for Node.js environment where DOMMatrix is missing (required by some pdf.js internals)
if (typeof global.DOMMatrix === 'undefined') {
    // @ts-ignore
    global.DOMMatrix = class DOMMatrix {
        constructor() { return this; }
        transformPoint(p: any) { return p; }
        translate() { return this; }
        scale() { return this; }
        rotate() { return this; }
        multiply() { return this; }
        inverse() { return this; }
    };
}

const pdfLib = require('pdf-parse');
// Handle ESM/CJS interop or library changes where default might be the function
const pdf = typeof pdfLib === 'function' ? pdfLib : (pdfLib.default || pdfLib.PDFParse || pdfLib);

export async function parsePdfServerAction(formData: FormData) {
    const file = formData.get('file') as File;

    if (!file) {
        throw new Error('No file provided');
    }

    const arrayBuffer = await file.arrayBuffer();
    // pdf-parse v2+ requires Uint8Array, not Buffer
    const uint8Array = new Uint8Array(arrayBuffer);

    try {
        // v2: Class-based API
        if (pdf.prototype && pdf.prototype.getText) {
            // @ts-ignore - dynamic import handling
            const instance = new pdf(uint8Array);
            const result = await instance.getText();
            return {
                text: result ? (result.text || '') : '',
                numpages: result ? (result.total || 0) : 0,
                info: {}
            };
        }

        // Legacy v1: Function-based API
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdf(buffer);
        return {
            text: data.text,
            numpages: data.numpages,
            info: data.info
        };
    } catch (error: any) {
        console.error('PDF Parse Error:', error);
        throw new Error('Failed to parse PDF: ' + error.message);
    }
}
