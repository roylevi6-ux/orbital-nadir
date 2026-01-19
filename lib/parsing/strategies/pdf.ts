import { ParseResult, ParsedTransaction } from '../types';
import { parsePdfServerAction } from '@/app/actions/parse-pdf';
import { normalizeDate } from '../heuristics';

export async function parsePdf(file: File): Promise<ParseResult> {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const { text } = await parsePdfServerAction(formData);

        // If no text extracted, return empty result
        if (!text || text.trim().length === 0) {
            return {
                fileName: file.name,
                transactions: [],
                totalRows: 0,
                validRows: 0,
                errorRows: 0,
                sourceType: 'pdf'
            };
        }

        const transactions: ParsedTransaction[] = [];

        // ONE ZERO Hebrew Bank Statement Parsing (Option B: Date-boundary approach)
        // 
        // The PDF text is extracted as a stream. We split by date pairs (DD/MM/YYYY DD/MM/YYYY)
        // Each segment between date pairs contains: Balance, Credit, Debit, Description
        // 
        // IMPORTANT: The shekel symbol uses U+201D (curly quote) not ASCII quote
        // Pattern: ח"ש where " is U+201D

        // Find all date pairs
        const datePairPattern = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/g;
        const dateMatches: { dates: string[]; index: number; length: number }[] = [];
        let match;
        while ((match = datePairPattern.exec(text)) !== null) {
            dateMatches.push({
                dates: [match[1], match[2]],
                index: match.index,
                length: match[0].length
            });
        }

        // Shekel pattern with curly quote (U+201D)
        const shekelPattern = /ח\u201dש\s+([\d,]+\.?\d*)/g;

        // Process each segment (skip first which is usually header)
        for (let i = 1; i < dateMatches.length; i++) {
            const current = dateMatches[i];
            const prevEnd = dateMatches[i - 1].index + dateMatches[i - 1].length;
            const segment = text.substring(prevEnd, current.index + current.length);

            // Extract all shekel amounts from this segment
            const amounts: number[] = [];
            let shekelMatch;
            const localPattern = new RegExp(shekelPattern.source, 'g');
            while ((shekelMatch = localPattern.exec(segment)) !== null) {
                const val = parseFloat(shekelMatch[1].replace(/,/g, ''));
                amounts.push(isNaN(val) ? 0 : val);
            }

            // Need at least 2 amounts (Balance + Credit or Debit)
            if (amounts.length < 2) continue;

            // Format: ח"ש [Balance] ח"ש [Credit] ח"ש [Debit] [Description] [Date] [Date]
            // amounts[0] = Balance (ignore)
            // amounts[1] = Credit (income if > 0)
            // amounts[2] = Debit (expense if > 0)
            const credit = amounts.length >= 2 ? amounts[1] : 0;
            const debit = amounts.length >= 3 ? amounts[2] : 0;

            // Extract description by removing amounts and dates
            let desc = segment
                .replace(/ח\u201dש\s+[\d,]+\.?\d*/g, '')
                .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
                .replace(/[\s]+/g, ' ')
                .trim();

            // Fix Hebrew RTL text (PDF extraction reverses RTL text)
            // Step 1: Reverse each Hebrew word's characters
            // Step 2: Reverse the order of consecutive Hebrew words
            const words = desc.split(' ');
            const processedWords: string[] = [];
            let hebrewBuffer: string[] = [];

            const flushHebrewBuffer = () => {
                if (hebrewBuffer.length > 0) {
                    // Reverse the order of Hebrew words and add them
                    processedWords.push(...hebrewBuffer.reverse());
                    hebrewBuffer = [];
                }
            };

            for (const word of words) {
                if (/[\u0590-\u05FF]/.test(word)) {
                    // Hebrew word - reverse characters and add to buffer
                    hebrewBuffer.push(word.split('').reverse().join(''));
                } else {
                    // Non-Hebrew word - flush buffer first, then add this word
                    flushHebrewBuffer();
                    processedWords.push(word);
                }
            }
            // Flush any remaining Hebrew words
            flushHebrewBuffer();

            desc = processedWords.join(' ');

            // Skip header/summary rows
            if (desc.includes('הרתי') || desc.includes('ךיראת') || desc.length < 3) continue;

            // Determine transaction type and amount
            let amount = 0;
            let transactionType: 'income' | 'expense' = 'expense';

            if (credit > 0 && debit === 0) {
                amount = credit;
                transactionType = 'income';
            } else if (debit > 0) {
                amount = debit;
                transactionType = 'expense';
            } else if (credit > 0) {
                amount = credit;
                transactionType = 'income';
            }

            if (amount <= 0) continue;

            // Normalize the transaction date (second date in the pair)
            const normalizedDate = normalizeDate(current.dates[1]);
            if (!normalizedDate) continue;

            transactions.push({
                id: `pdf-row-${i}`,
                date: normalizedDate,
                merchant_raw: desc.substring(0, 200),
                amount,
                currency: 'ILS',
                type: transactionType,
                status: 'pending'
            });
        }

        console.log(`PDF Parsing: Extracted ${transactions.length} transactions from ONE ZERO format`);

        return {
            fileName: file.name,
            transactions,
            totalRows: dateMatches.length,
            validRows: transactions.length,
            errorRows: 0,
            sourceType: 'pdf'
        };

    } catch (error) {
        console.error('PDF Strategy Error:', error);
        throw error;
    }
}
