import { ParseResult, ParsedTransaction } from '../types';
import { detectTransactionsFromImage } from '@/app/actions/ocr-parse';
import { v4 as uuidv4 } from 'uuid';

export async function parseImage(file: File): Promise<ParseResult> {
    try {
        // 1. Convert File to Base64
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });

        // 2. Call Server Action
        const rawData = await detectTransactionsFromImage(base64);

        if (!Array.isArray(rawData)) {
            throw new Error('Invalid response from OCR');
        }

        // 3. Map to ParsedTransaction
        const transactions: ParsedTransaction[] = rawData.map((item: any) => ({
            id: uuidv4(),
            date: item.date, // "2024-01-01"
            merchant_raw: item.merchant || 'Unknown',
            amount: Math.abs(Number(item.amount)),
            currency: 'ILS',
            type: item.type === 'income' ? 'income' : 'expense',
            status: 'valid'
        }));

        return {
            fileName: file.name,
            sourceType: 'screenshot',
            transactions,
            validRows: transactions.length,
            totalRows: transactions.length,
            errorRows: 0
        };
    } catch (error: any) {
        console.error('Image Parse Error:', error);
        return {
            fileName: file.name,
            sourceType: 'screenshot',
            transactions: [],
            validRows: 0,
            totalRows: 0,
            errorRows: 0 // Cannot return actual errors array due to type constraint
        };
    }
}
