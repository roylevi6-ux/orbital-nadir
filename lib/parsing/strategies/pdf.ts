import { ParseResult, ParsedTransaction } from '../types';
import { parsePdfServerAction } from '@/app/actions/parse-pdf';
import { normalizeDate, detectCurrency } from '../heuristics';
import { logger } from '@/lib/logger';

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

        // Detect currency from PDF content
        const detectedCurrency = detectCurrency(text);
        logger.debug(`[PDF] Detected currency: ${detectedCurrency} for ${file.name}`);
        logger.debug(`[PDF] Raw text preview (first 1000 chars): ${text.substring(0, 1000)}`);

        // ONE ZERO Hebrew Bank Statement Parsing
        //
        // Table format (RTL - columns right to left):
        // תאריך תנועה | תאריך ערך | פרטי הפעולה | חיובים | זיכויים | יתרה
        //
        // PDF text extraction gives us date pairs followed by amounts and description
        // Format in extracted text: [Balance] [Credit] [Debit] [Description] [ValueDate] [TxDate]
        //
        // We look for date pairs and extract the numeric amounts that precede them

        // Find all date pairs (DD/MM/YYYY DD/MM/YYYY pattern)
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

        logger.debug(`[PDF] Found ${dateMatches.length} date pairs`);

        // Process each segment between date pairs
        for (let i = 1; i < dateMatches.length; i++) {
            const current = dateMatches[i];
            const prevEnd = dateMatches[i - 1].index + dateMatches[i - 1].length;
            const segment = text.substring(prevEnd, current.index + current.length);

            // Try multiple amount extraction strategies:

            // Strategy 1: Look for ח"ש prefixed amounts (old format with curly quote U+201D)
            const shekelPattern = /ח\u201dש\s+([\d,]+\.?\d*)/g;
            const shekelAmounts: number[] = [];
            let shekelMatch;
            while ((shekelMatch = shekelPattern.exec(segment)) !== null) {
                const val = parseFloat(shekelMatch[1].replace(/,/g, ''));
                if (!isNaN(val)) shekelAmounts.push(val);
            }

            // Strategy 2: Look for plain numbers (new table format)
            // Pattern: numbers with optional commas and decimals, not part of dates or account numbers
            // Extract all standalone numbers that look like amounts
            const plainNumberPattern = /(?<![\/\d-])(-?[\d,]+\.?\d*)(?![\/\d])/g;
            const plainAmounts: number[] = [];
            let plainMatch;
            const segmentForNumbers = segment.replace(/\d{2}\/\d{2}\/\d{4}/g, ''); // Remove dates first
            while ((plainMatch = plainNumberPattern.exec(segmentForNumbers)) !== null) {
                const numStr = plainMatch[1].replace(/,/g, '');
                const val = parseFloat(numStr);
                // Filter out likely non-amount numbers (account numbers, reference numbers)
                // Account/ref numbers are usually longer than 6 digits without decimals
                if (!isNaN(val) && val !== 0) {
                    const hasDecimal = plainMatch[1].includes('.');
                    const digitCount = numStr.replace(/[.-]/g, '').length;
                    // Accept: amounts with decimals, or whole numbers with <= 6 digits
                    if (hasDecimal || digitCount <= 6) {
                        plainAmounts.push(val);
                    }
                }
            }

            // Use whichever strategy found amounts
            let amounts = shekelAmounts.length >= 2 ? shekelAmounts : plainAmounts;

            // For table format, we expect: [Balance] [Credit] [Debit] or similar
            // Balance is typically the largest and should be ignored
            // Credit (זיכויים) = income, Debit (חיובים) = expense

            if (amounts.length < 2) {
                logger.debug(`[PDF] Segment ${i}: Not enough amounts found (${amounts.length})`);
                continue;
            }

            // In the table format, amounts appear as: Balance, Credit, Debit
            // But the order in extracted text may vary.
            // Key insight: Balance is usually much larger than Credit/Debit
            // We need to identify which is which

            // Sort amounts by absolute value to identify balance (usually largest)
            const sortedBySize = [...amounts].sort((a, b) => Math.abs(b) - Math.abs(a));

            // The largest amount is likely the balance - skip it
            // Remaining amounts are credit and debit
            const nonBalanceAmounts = amounts.length > 2
                ? amounts.slice(1) // Skip first (balance) if we have 3+ amounts
                : amounts; // If only 2 amounts, use both

            // Filter to find credit (positive income) and debit (expense)
            // In ONE ZERO format: 0 means no transaction in that column
            let credit = 0;
            let debit = 0;

            for (const amt of nonBalanceAmounts) {
                if (amt > 0 && amt < sortedBySize[0]) { // Positive and smaller than balance
                    // Could be credit or debit - check context
                    if (credit === 0) credit = amt;
                    else if (debit === 0) debit = amt;
                }
            }

            // If we still have 0s, try to be smarter about the format
            // Table columns: יתרה | זיכויים | חיובים (Balance | Credit | Debit in RTL)
            // Extracted order often reverses, so we might see: Balance, Credit, Debit
            if (amounts.length >= 3 && credit === 0 && debit === 0) {
                // amounts[0] = Balance (ignore)
                // amounts[1] = Credit (income)
                // amounts[2] = Debit (expense)
                credit = amounts[1] || 0;
                debit = amounts[2] || 0;
            } else if (amounts.length === 2) {
                // Only 2 amounts - one is balance, one is the transaction
                // The smaller one is likely the transaction
                const smaller = Math.min(Math.abs(amounts[0]), Math.abs(amounts[1]));
                const larger = Math.max(Math.abs(amounts[0]), Math.abs(amounts[1]));
                if (smaller > 0 && larger > smaller * 5) {
                    // Large difference suggests smaller is transaction, larger is balance
                    // But we don't know if it's credit or debit without more context
                    // Default to expense (debit) as it's more common
                    debit = smaller;
                }
            }

            // Extract description by removing amounts and dates
            let desc = segment
                .replace(/ח\u201dש\s+[\d,]+\.?\d*/g, '') // Remove ח"ש amounts
                .replace(/-?[\d,]+\.?\d*/g, '') // Remove plain numbers
                .replace(/\d{2}\/\d{2}\/\d{4}/g, '') // Remove dates
                .replace(/[\s]+/g, ' ')
                .trim();

            // Fix Hebrew RTL text (PDF extraction reverses RTL text)
            const words = desc.split(' ');
            const processedWords: string[] = [];
            let hebrewBuffer: string[] = [];

            const flushHebrewBuffer = () => {
                if (hebrewBuffer.length > 0) {
                    processedWords.push(...hebrewBuffer.reverse());
                    hebrewBuffer = [];
                }
            };

            for (const word of words) {
                if (/[\u0590-\u05FF]/.test(word)) {
                    hebrewBuffer.push(word.split('').reverse().join(''));
                } else {
                    flushHebrewBuffer();
                    processedWords.push(word);
                }
            }
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

            if (amount <= 0) {
                logger.debug(`[PDF] Segment ${i}: No valid amount found (credit=${credit}, debit=${debit})`);
                continue;
            }

            // Normalize the transaction date (first date is value date, second is transaction date)
            // Use the transaction date (second one)
            const normalizedDate = normalizeDate(current.dates[1]);
            if (!normalizedDate) continue;

            transactions.push({
                id: `pdf-row-${i}`,
                date: normalizedDate,
                merchant_raw: desc.substring(0, 200),
                amount,
                currency: detectedCurrency,
                type: transactionType,
                status: 'pending'
            });

            logger.debug(`[PDF] Extracted: ${normalizedDate} | ${desc.substring(0, 30)} | ${amount} | ${transactionType}`);
        }

        logger.debug(`[PDF] Total extracted: ${transactions.length} transactions from ONE ZERO format`);

        return {
            fileName: file.name,
            transactions,
            totalRows: dateMatches.length,
            validRows: transactions.length,
            errorRows: 0,
            sourceType: 'pdf'
        };

    } catch (error) {
        logger.error('[PDF] Strategy Error:', error);
        throw error;
    }
}
