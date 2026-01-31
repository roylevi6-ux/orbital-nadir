import { ParseResult, ParsedTransaction } from '../types';
import { parsePdfServerAction, PdfTextItem } from '@/app/actions/parse-pdf';
import { normalizeDate, detectCurrency } from '../heuristics';
import { logger } from '@/lib/logger';

interface TableRow {
    y: number;
    items: PdfTextItem[];
}

interface ParsedRow {
    balance: number | null;
    income: number | null;
    expense: number | null;
    description: string;
    valueDate: string | null;
    transactionDate: string | null;
}

export async function parsePdf(file: File): Promise<ParseResult> {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const { text, items } = await parsePdfServerAction(formData);

        logger.info(`[PDF] ========== Parsing file: ${file.name} ==========`);
        logger.info(`[PDF] Raw text length: ${text?.length || 0} chars`);
        logger.info(`[PDF] Total text items with positions: ${items?.length || 0}`);

        // If no text extracted, return empty result
        if (!text || text.trim().length === 0) {
            logger.warn(`[PDF] No text extracted from PDF`);
            return {
                fileName: file.name,
                transactions: [],
                totalRows: 0,
                validRows: 0,
                errorRows: 0,
                sourceType: 'pdf'
            };
        }

        // Log first few items to understand structure
        if (items && items.length > 0) {
            logger.info(`[PDF] Sample items (first 20):`);
            items.slice(0, 20).forEach((item, i) => {
                logger.info(`[PDF]   ${i}: x=${item.x.toFixed(1)}, y=${item.y.toFixed(1)}, text="${item.text}"`);
            });
        }

        const transactions: ParsedTransaction[] = [];

        // Detect currency from PDF content
        const detectedCurrency = detectCurrency(text);
        logger.info(`[PDF] Detected currency: ${detectedCurrency}`);

        // Israeli Bank Statement Column-Based Parsing
        //
        // ONE ZERO Bank Statement PDF columns (LEFT to RIGHT):
        // Column 1: Balance (יתרה) - IGNORE
        // Column 2: Income/Reimbursements (זכות) - use if > 0
        // Column 3: Expenses (חובה) - use if > 0
        // Column 4: Merchant/Description (פרטים) - remove confirmation numbers
        // Column 5: Value Date (תאריך ערך) - IGNORE
        // Column 6: Transaction Date (תאריך) - USE THIS (rightmost)

        // Group items by Y coordinate (rows) with tolerance
        // Use tight tolerance to avoid merging separate transaction rows
        const rowTolerance = 0.8; // Y values within 0.8 units are same row
        const rows = groupItemsByRow(items, rowTolerance);

        logger.info(`[PDF] Grouped into ${rows.length} rows (tolerance: ${rowTolerance})`);

        // Log first few rows to understand structure
        rows.slice(0, 10).forEach((row, i) => {
            const rowTexts = row.items.map(item => `"${item.text}"(x=${item.x.toFixed(1)})`).join(', ');
            logger.info(`[PDF] Row ${i} (y=${row.y.toFixed(1)}): ${rowTexts.substring(0, 200)}`);
        });

        // Analyze column positions from all rows to determine column boundaries
        const columnBoundaries = detectColumnBoundaries(rows);
        logger.info(`[PDF] Detected ${columnBoundaries.length} column boundaries: ${JSON.stringify(columnBoundaries.map(b => b.toFixed(1)))}`);

        // Process each row
        let rowIndex = 0;
        let skippedNoDate = 0;
        let skippedHeader = 0;
        let skippedNoAmount = 0;
        let skippedShortDesc = 0;

        for (const row of rows) {
            rowIndex++;
            const parsedRow = parseRowByColumns(row, columnBoundaries);

            if (!parsedRow) {
                continue;
            }

            // Skip rows without valid dates
            if (!parsedRow.transactionDate && !parsedRow.valueDate) {
                skippedNoDate++;
                continue;
            }

            // Skip header rows (contain "יתרה", "תאריך", etc.)
            if (parsedRow.description.includes('יתרה') ||
                parsedRow.description.includes('תאריך') ||
                parsedRow.description.includes('פרטים') ||
                parsedRow.description.includes('חובה') ||
                parsedRow.description.includes('זכות')) {
                skippedHeader++;
                continue;
            }

            // Log parsed row details for debugging
            logger.debug(`[PDF] Row ${rowIndex} parsed: dates=[${parsedRow.valueDate}, ${parsedRow.transactionDate}], amounts=[bal:${parsedRow.balance}, inc:${parsedRow.income}, exp:${parsedRow.expense}], desc="${parsedRow.description.substring(0, 50)}"`);

            // Determine transaction type and amount
            let amount = 0;
            let transactionType: 'income' | 'expense' = 'expense';

            if (parsedRow.income && parsedRow.income > 0 && (!parsedRow.expense || parsedRow.expense === 0)) {
                amount = parsedRow.income;
                transactionType = 'income';
            } else if (parsedRow.expense && parsedRow.expense > 0) {
                amount = parsedRow.expense;
                transactionType = 'expense';
            }

            if (amount <= 0) {
                logger.debug(`[PDF] Row ${rowIndex}: No valid amount found (income=${parsedRow.income}, expense=${parsedRow.expense})`);
                skippedNoAmount++;
                continue;
            }

            // Use transaction date (prefer it over value date)
            const dateStr = parsedRow.transactionDate || parsedRow.valueDate;
            if (!dateStr) {
                continue;
            }

            const normalizedDate = normalizeDate(dateStr);
            if (!normalizedDate) {
                logger.debug(`[PDF] Row ${rowIndex}: Could not normalize date: ${dateStr}`);
                continue;
            }

            // Clean up description
            const description = cleanDescription(parsedRow.description);
            if (description.length < 2) {
                skippedShortDesc++;
                continue;
            }

            transactions.push({
                id: `pdf-row-${rowIndex}`,
                date: normalizedDate,
                merchant_raw: description.substring(0, 200),
                amount,
                currency: detectedCurrency,
                type: transactionType,
                status: 'pending'
            });

            logger.info(`[PDF] ✓ Extracted: ${normalizedDate} | ${description.substring(0, 30)} | ${amount} ${detectedCurrency} | ${transactionType}`);
        }

        logger.info(`[PDF] ========== Parse Summary (Row Method) ==========`);
        logger.info(`[PDF] Total rows: ${rows.length}`);
        logger.info(`[PDF] Skipped - no date: ${skippedNoDate}`);
        logger.info(`[PDF] Skipped - header row: ${skippedHeader}`);
        logger.info(`[PDF] Skipped - no amount: ${skippedNoAmount}`);
        logger.info(`[PDF] Skipped - short description: ${skippedShortDesc}`);
        logger.info(`[PDF] Extracted transactions: ${transactions.length}`);

        // If row-based parsing didn't find any transactions, try date-anchored parsing
        if (transactions.length === 0) {
            logger.info(`[PDF] Row method found 0 transactions, trying date-anchored method...`);
            const dateAnchoredTxs = parsePdfByDateAnchors(items, detectedCurrency);
            if (dateAnchoredTxs.length > 0) {
                logger.info(`[PDF] Date-anchored method found ${dateAnchoredTxs.length} transactions`);
                return {
                    fileName: file.name,
                    transactions: dateAnchoredTxs,
                    totalRows: dateAnchoredTxs.length,
                    validRows: dateAnchoredTxs.length,
                    errorRows: 0,
                    sourceType: 'pdf'
                };
            }

            // Last resort: try regex-based text parsing
            logger.info(`[PDF] Date-anchored method found 0 transactions, trying regex text method...`);
            const regexTxs = parsePdfByRegex(text, detectedCurrency);
            if (regexTxs.length > 0) {
                logger.info(`[PDF] Regex method found ${regexTxs.length} transactions`);
                return {
                    fileName: file.name,
                    transactions: regexTxs,
                    totalRows: regexTxs.length,
                    validRows: regexTxs.length,
                    errorRows: 0,
                    sourceType: 'pdf'
                };
            }
        }

        return {
            fileName: file.name,
            transactions,
            totalRows: rows.length,
            validRows: transactions.length,
            errorRows: 0,
            sourceType: 'pdf'
        };

    } catch (error) {
        logger.error('[PDF] Strategy Error:', error);
        throw error;
    }
}

/**
 * Group text items into rows based on Y coordinate
 */
function groupItemsByRow(items: PdfTextItem[], tolerance: number): TableRow[] {
    const rows: TableRow[] = [];

    // Sort by Y first
    const sortedItems = [...items].sort((a, b) => a.y - b.y);

    let currentRow: TableRow | null = null;

    for (const item of sortedItems) {
        if (!currentRow || Math.abs(item.y - currentRow.y) > tolerance) {
            // Start new row
            currentRow = { y: item.y, items: [] };
            rows.push(currentRow);
        }
        currentRow.items.push(item);
    }

    // Sort items within each row by X coordinate (left to right)
    for (const row of rows) {
        row.items.sort((a, b) => a.x - b.x);
    }

    return rows;
}

/**
 * Detect column boundaries based on common X positions across rows
 */
function detectColumnBoundaries(rows: TableRow[]): number[] {
    // Collect all unique X positions
    const xPositions: number[] = [];

    for (const row of rows) {
        for (const item of row.items) {
            xPositions.push(item.x);
        }
    }

    // Cluster X positions to find column boundaries
    // We expect ~6 columns for Israeli bank statements
    xPositions.sort((a, b) => a - b);

    // Find gaps between positions to determine column boundaries
    const boundaries: number[] = [];
    const clusterThreshold = 2; // Items within 2 units are in same column

    let lastX = -Infinity;
    for (const x of xPositions) {
        if (x - lastX > clusterThreshold) {
            boundaries.push(x);
        }
        lastX = x;
    }

    // Return boundaries (representative X value for each column)
    // Take only the most common/consistent boundaries
    return boundaries.slice(0, 10); // Cap at 10 columns
}

/**
 * Parse a single row using detected column positions
 */
function parseRowByColumns(row: TableRow, columnBoundaries: number[]): ParsedRow | null {
    if (row.items.length < 2) {
        return null;
    }

    // Assign each item to a column based on X position
    const columnItems: Map<number, string[]> = new Map();

    for (const item of row.items) {
        // Find closest column boundary
        let bestColumn = 0;
        let minDist = Infinity;

        for (let i = 0; i < columnBoundaries.length; i++) {
            const dist = Math.abs(item.x - columnBoundaries[i]);
            if (dist < minDist) {
                minDist = dist;
                bestColumn = i;
            }
        }

        if (!columnItems.has(bestColumn)) {
            columnItems.set(bestColumn, []);
        }
        columnItems.get(bestColumn)!.push(item.text);
    }

    // Convert to array and sort by column index
    const columns: string[][] = [];
    const sortedKeys = Array.from(columnItems.keys()).sort((a, b) => a - b);
    for (const key of sortedKeys) {
        columns.push(columnItems.get(key)!);
    }

    // Expected column order (left to right in PDF coordinates):
    // 0: Balance | 1: Income | 2: Expense | 3: Description | 4: Value Date | 5: Transaction Date
    //
    // But actual column count may vary. Let's detect by content:
    // - Dates are in DD/MM/YYYY format
    // - Amounts are numbers with optional decimals
    // - Description is Hebrew text

    const result: ParsedRow = {
        balance: null,
        income: null,
        expense: null,
        description: '',
        valueDate: null,
        transactionDate: null
    };

    // Parse each column to determine its type
    const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
    const amountPattern = /^-?[\d,]+\.?\d*$/;

    const parsedColumns: Array<{ type: 'date' | 'amount' | 'text'; value: string | number }> = [];

    for (const colTexts of columns) {
        const text = colTexts.join(' ').trim();

        if (datePattern.test(text)) {
            parsedColumns.push({ type: 'date', value: text });
        } else if (amountPattern.test(text.replace(/,/g, ''))) {
            const numVal = parseFloat(text.replace(/,/g, ''));
            parsedColumns.push({ type: 'amount', value: numVal });
        } else if (text.length > 0) {
            parsedColumns.push({ type: 'text', value: text });
        }
    }

    // Now assign based on position and type
    // Pattern: amounts come first (balance, income, expense), then description, then dates
    const amounts: number[] = [];
    const dates: string[] = [];
    const texts: string[] = [];

    for (const col of parsedColumns) {
        if (col.type === 'amount') amounts.push(col.value as number);
        else if (col.type === 'date') dates.push(col.value as string);
        else if (col.type === 'text') texts.push(col.value as string);
    }

    // Assign amounts (order: balance, income, expense based on position - leftmost to rightmost)
    // Balance is typically much larger than income/expense
    // Income and expense: one is usually 0
    if (amounts.length >= 3) {
        result.balance = amounts[0];
        result.income = amounts[1];
        result.expense = amounts[2];
    } else if (amounts.length === 2) {
        // Could be income/expense only (no balance column visible)
        // Or balance + one amount
        const absVals = amounts.map(a => Math.abs(a));
        if (absVals[0] > absVals[1] * 5) {
            // First is much larger - likely balance
            result.balance = amounts[0];
            result.expense = amounts[1]; // Assume expense
        } else {
            // Both similar size - likely income and expense columns
            result.income = amounts[0];
            result.expense = amounts[1];
        }
    } else if (amounts.length === 1) {
        // Single amount - could be expense or income
        result.expense = amounts[0]; // Default to expense
    }

    // Assign dates - rightmost date is transaction date (use it), second-right is value date (ignore)
    // Dates come in order: [value date, transaction date] in the parsed array
    // But we want the LAST date (rightmost column = transaction date)
    if (dates.length >= 2) {
        result.valueDate = dates[0];  // Ignore this one
        result.transactionDate = dates[dates.length - 1];  // Use the rightmost/last date
    } else if (dates.length === 1) {
        result.transactionDate = dates[0];
    }

    // Assign description (combine all text columns)
    result.description = texts.join(' ');

    return result;
}

/**
 * Alternative parsing method: Find dates first, then collect surrounding data
 * This works better for PDFs where multi-line descriptions cause row grouping to fail
 */
function parsePdfByDateAnchors(items: PdfTextItem[], currency: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
    const amountPattern = /^-?[\d,]+\.?\d*$/;

    // Find all date items
    const dateItems = items.filter(item => datePattern.test(item.text.trim()));
    logger.info(`[PDF-DateAnchor] Found ${dateItems.length} date items`);

    if (dateItems.length === 0) {
        return [];
    }

    // Group dates by Y coordinate (tolerance of 0.5)
    const dateGroups: Map<number, PdfTextItem[]> = new Map();
    for (const item of dateItems) {
        const roundedY = Math.round(item.y * 2) / 2; // Round to nearest 0.5
        if (!dateGroups.has(roundedY)) {
            dateGroups.set(roundedY, []);
        }
        dateGroups.get(roundedY)!.push(item);
    }

    logger.info(`[PDF-DateAnchor] Date groups: ${dateGroups.size}`);

    // Sort Y coordinates to process rows in order
    const sortedYs = Array.from(dateGroups.keys()).sort((a, b) => a - b);

    // For each date row, find associated amounts and text
    for (let i = 0; i < sortedYs.length; i++) {
        const currentY = sortedYs[i];
        const nextY = sortedYs[i + 1] || currentY + 50; // Large default for last row
        const dates = dateGroups.get(currentY)!;

        // Collect all items in this Y range (current date row to next date row)
        const rowItems = items.filter(item =>
            item.y >= currentY - 1 && item.y < nextY - 1
        );

        // Sort by X coordinate
        rowItems.sort((a, b) => a.x - b.x);

        // Extract amounts and text
        const amounts: number[] = [];
        const texts: string[] = [];
        const rowDates: string[] = dates.map(d => d.text.trim());

        for (const item of rowItems) {
            const text = item.text.trim();
            if (datePattern.test(text)) continue; // Skip dates, we already have them

            if (amountPattern.test(text.replace(/,/g, ''))) {
                const numVal = parseFloat(text.replace(/,/g, ''));
                if (!isNaN(numVal)) {
                    amounts.push(numVal);
                }
            } else if (text.length > 1 && !/^[0.]$/.test(text)) {
                texts.push(text);
            }
        }

        // Skip if no dates or no amounts
        if (rowDates.length === 0 || amounts.length === 0) {
            continue;
        }

        // Skip header rows
        const description = texts.join(' ');
        if (description.includes('יתרה') ||
            description.includes('תאריך') ||
            description.includes('פרטים') ||
            description.includes('חובה') ||
            description.includes('זכות') ||
            description.includes('סה"כ')) {
            continue;
        }

        // Determine amount and type
        // For bank statements: amounts are usually [balance, income, expense] or similar
        // We need to identify which is the transaction amount
        let amount = 0;
        let transactionType: 'income' | 'expense' = 'expense';

        if (amounts.length >= 3) {
            // Assume: balance (largest), income (second), expense (third)
            // Sort to find the largest (likely balance)
            const sorted = [...amounts].sort((a, b) => Math.abs(b) - Math.abs(a));
            const balance = sorted[0];
            const others = amounts.filter(a => a !== balance);

            if (others.length >= 2) {
                // Check which one is non-zero
                if (others[0] > 0 && (others[1] === 0 || others[1] === null)) {
                    amount = others[0];
                    transactionType = 'income';
                } else if (others[1] > 0) {
                    amount = others[1];
                    transactionType = 'expense';
                } else {
                    amount = others[0] || others[1];
                }
            } else if (others.length === 1) {
                amount = others[0];
            }
        } else if (amounts.length === 2) {
            // Could be balance + amount, or income + expense
            const [a, b] = amounts;
            if (Math.abs(a) > Math.abs(b) * 5) {
                // First is balance
                amount = b;
            } else {
                // Likely income/expense - take the non-zero one
                amount = a > 0 ? a : b;
                transactionType = a > 0 && b === 0 ? 'income' : 'expense';
            }
        } else if (amounts.length === 1) {
            amount = amounts[0];
        }

        if (amount <= 0) continue;

        // Use the first date as transaction date
        const dateStr = rowDates[rowDates.length - 1] || rowDates[0]; // Last date is usually transaction date
        const normalizedDate = normalizeDate(dateStr);
        if (!normalizedDate) continue;

        const cleanedDesc = cleanDescription(description);
        if (cleanedDesc.length < 2) continue;

        transactions.push({
            id: `pdf-anchor-${i}`,
            date: normalizedDate,
            merchant_raw: cleanedDesc.substring(0, 200),
            amount,
            currency,
            type: transactionType,
            status: 'pending'
        });

        logger.info(`[PDF-DateAnchor] ✓ Extracted: ${normalizedDate} | ${cleanedDesc.substring(0, 30)} | ${amount} | ${transactionType}`);
    }

    return transactions;
}

/**
 * Last resort: Parse PDF by scanning raw text for transaction patterns
 * Looks for date patterns followed by amounts in the text
 */
function parsePdfByRegex(text: string, currency: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];

    logger.info(`[PDF-Regex] Scanning ${text.length} chars of raw text`);
    logger.info(`[PDF-Regex] First 500 chars: ${text.substring(0, 500)}`);

    // Pattern to find dates in DD/MM/YYYY format
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;

    // Find all dates
    const dateMatches: { date: string; index: number }[] = [];
    let match;
    while ((match = datePattern.exec(text)) !== null) {
        dateMatches.push({ date: match[1], index: match.index });
    }

    logger.info(`[PDF-Regex] Found ${dateMatches.length} date matches`);

    if (dateMatches.length === 0) {
        return [];
    }

    // Log all dates found
    dateMatches.slice(0, 20).forEach((d, i) => {
        logger.info(`[PDF-Regex] Date ${i}: ${d.date} at index ${d.index}`);
    });

    // For ONE ZERO bank format, dates come in pairs (transaction date, value date)
    // Look for patterns: DATE DATE ... AMOUNT ... BALANCE
    // Amount pattern: numbers with optional comma separators and decimal
    const amountPattern = /[\d,]+\.?\d*/g;

    // Process pairs of dates (or single dates if odd count)
    for (let i = 0; i < dateMatches.length; i += 2) {
        const currentDate = dateMatches[i];
        const nextDateIndex = i + 2 < dateMatches.length ? dateMatches[i + 2].index : text.length;

        // Get text between this date pair and the next
        const segment = text.substring(currentDate.index, nextDateIndex);

        // Find all amounts in this segment
        const amounts: number[] = [];
        let amountMatch;
        const amountRegex = /[\d,]+\.?\d*/g;
        while ((amountMatch = amountRegex.exec(segment)) !== null) {
            const numStr = amountMatch[0].replace(/,/g, '');
            const num = parseFloat(numStr);
            if (!isNaN(num) && num > 0 && numStr.length > 0) {
                amounts.push(num);
            }
        }

        // Skip if no amounts found (besides the dates themselves)
        if (amounts.length < 2) continue;

        // Get description text (Hebrew text between dates and amounts)
        const hebrewTextMatch = segment.match(/[\u0590-\u05FF][^\d]*/);
        const description = hebrewTextMatch ? hebrewTextMatch[0].trim() : '';

        // Skip if it's a header row
        if (description.includes('יתרה') ||
            description.includes('תאריך') ||
            description.includes('סך') ||
            description.includes('תקופה')) {
            continue;
        }

        // Identify transaction amount vs balance
        // Balance is typically much larger, transaction amount is smaller
        const sortedAmounts = [...amounts].sort((a, b) => b - a);
        const balance = sortedAmounts[0];
        const txAmounts = sortedAmounts.slice(1).filter(a => a < balance / 2);

        if (txAmounts.length === 0) continue;

        // Take the largest non-balance amount
        const amount = txAmounts[0];
        if (amount <= 0) continue;

        const normalizedDate = normalizeDate(currentDate.date);
        if (!normalizedDate) continue;

        // For bank statements, debits and credits are in separate columns
        // We need context to determine type - default to expense
        const transactionType: 'income' | 'expense' = 'expense';

        transactions.push({
            id: `pdf-regex-${i}`,
            date: normalizedDate,
            merchant_raw: description.substring(0, 200) || 'Unknown',
            amount,
            currency,
            type: transactionType,
            status: 'pending'
        });

        logger.info(`[PDF-Regex] ✓ Extracted: ${normalizedDate} | ${description.substring(0, 30)} | ${amount} | ${transactionType}`);
    }

    return transactions;
}

/**
 * Clean up description/merchant text
 * - Fix Hebrew RTL text (pdf2json extracts Hebrew chars in reverse order)
 * - Remove confirmation numbers (standalone number sequences)
 * - Clean up whitespace
 */
function cleanDescription(desc: string): string {
    return desc
        .split(/\s+/)
        .filter(w => w.length > 0)
        // Remove standalone numbers (confirmation numbers like "211574046", "//989", etc.)
        .filter(w => !/^[\/\d]+$/.test(w))
        // Remove numbers at the end of words (like "8770" in "Withdrawal/8770")
        .map(w => w.replace(/\/\d+$/, '').replace(/\d{4,}/, ''))
        .filter(w => w.length > 0 && w !== '/')
        // Fix Hebrew text that's been reversed by pdf2json
        .map(w => fixHebrewWord(w))
        .join(' ')
        .trim();
}

/**
 * Fix Hebrew text that pdf2json extracts in reverse order
 * Hebrew characters in PDFs are often stored RTL but extracted LTR
 */
function fixHebrewWord(word: string): string {
    // Check if word contains Hebrew characters
    const hebrewPattern = /[\u0590-\u05FF]/;
    if (!hebrewPattern.test(word)) {
        return word; // No Hebrew, return as-is
    }

    // For mixed Hebrew/English words (like "Transfer/רפפורט"),
    // split by non-Hebrew segments and reverse only Hebrew parts
    const segments: string[] = [];
    let currentSegment = '';
    let isCurrentHebrew = false;

    for (const char of word) {
        const isHebrew = hebrewPattern.test(char);

        if (currentSegment.length === 0) {
            currentSegment = char;
            isCurrentHebrew = isHebrew;
        } else if (isHebrew === isCurrentHebrew) {
            currentSegment += char;
        } else {
            // Segment type changed - save current and start new
            if (isCurrentHebrew) {
                // Reverse Hebrew segment
                segments.push(currentSegment.split('').reverse().join(''));
            } else {
                segments.push(currentSegment);
            }
            currentSegment = char;
            isCurrentHebrew = isHebrew;
        }
    }

    // Handle last segment
    if (currentSegment.length > 0) {
        if (isCurrentHebrew) {
            segments.push(currentSegment.split('').reverse().join(''));
        } else {
            segments.push(currentSegment);
        }
    }

    return segments.join('');
}
