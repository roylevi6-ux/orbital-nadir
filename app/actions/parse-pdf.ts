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

const pdf = require('pdf-parse');

export async function parsePdfServerAction(formData: FormData) {
    const file = formData.get('file') as File;

    if (!file) {
        throw new Error('No file provided');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
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
