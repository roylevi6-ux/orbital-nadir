import { ParseResult, ParsedTransaction } from '../types';
import { parsePdfServerAction } from '@/app/actions/parse-pdf';

export async function parsePdf(file: File): Promise<ParseResult> {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const { text } = await parsePdfServerAction(formData);

        // Very basic regex scraping (Placeholder)
        // We look for patterns like DD/MM/YYYY Description Amount
        // This is HIGHLY specific to bank formats and needs real examples to be robust.
        // For MVP, we will just return a dummy result or attempt a generic regex.

        const transactions: ParsedTransaction[] = [];
        const lines = text.split('\n');
        let validCount = 0;

        // Generic regex for Date (DD/MM/YYYY) ... Amount (number with optional commas)
        // 01/01/2023  Grocery Store  150.00
        const lineRegex = /(\d{2}\/\d{2}\/\d{4,})[\s\t]+(.+)[\s\t]+([-]?[\d,]+\.\d{2})/;

        lines.forEach((line: string, index: number) => {
            const match = line.match(lineRegex);
            if (match) {
                const date = match[1];
                const desc = match[2].trim();
                const amountStr = match[3].replace(/,/g, '');
                const amount = parseFloat(amountStr);

                transactions.push({
                    id: `pdf-row-${index}`,
                    date,
                    merchant_raw: desc,
                    amount: Math.abs(amount),
                    currency: 'ILS',
                    type: amount >= 0 ? 'income' : 'expense', // Assuming positive in PDF is income, depends on statement
                    status: 'pending' // tentative
                });
                validCount++;
            }
        });

        return {
            fileName: file.name,
            transactions,
            totalRows: lines.length, // Rough count
            validRows: validCount,
            errorRows: 0,
            sourceType: 'pdf'
        };

    } catch (error) {
        console.error('PDF Strategy Error:', error);
        throw error;
    }
}
