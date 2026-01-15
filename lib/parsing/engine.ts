import { ParseResult } from './types';
import { parseCSV } from './strategies/csv';
import { parseExcel } from './strategies/excel';

export async function parseFile(file: File): Promise<ParseResult> {
    const type = file.type;

    if (type === 'text/csv' || file.name.endsWith('.csv')) {
        return parseCSV(file);
    }

    if (
        type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')
    ) {
        return parseExcel(file);
    }

    // PDF support
    if (type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const { parsePdf } = await import('./strategies/pdf');
        return parsePdf(file);
    }

    // Image support
    if (type.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(file.name)) {
        const { parseImage } = await import('./strategies/image');
        return parseImage(file);
    }

    throw new Error(`Unsupported file type: ${type}`);
}
