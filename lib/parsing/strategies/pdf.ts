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
        // Table format (RTL - columns from RIGHT to LEFT on screen):
        // תאריך | תאריך ערך | פרטים | חובה (expense) | זכות (income) | יתרה (balance)
        //
        // In the PDF coordinate system (LEFT to RIGHT):
        // Column 1 (leftmost, lowest X): Balance (יתרה)
        // Column 2: Income (זכות/זיכויים)
        // Column 3: Expense (חובה/חיובים)
        // Column 4: Description (פרטים)
        // Column 5: Value Date (תאריך ערך)
        // Column 6 (rightmost, highest X): Transaction Date (תאריך)

        // Group items by Y coordinate (rows) with tolerance
        // Using larger tolerance to handle multi-line descriptions within table rows
        // Typical bank statement row height is ~2-4 units
        const rowTolerance = 3.0; // Y values within 3.0 units are same row
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

    // Assign dates (order: value date, transaction date)
    if (dates.length >= 2) {
        result.valueDate = dates[0];
        result.transactionDate = dates[1];
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
 * Clean up description text - handle RTL Hebrew text
 */
function cleanDescription(desc: string): string {
    // Fix Hebrew RTL text (PDF extraction sometimes reverses RTL text)
    const words = desc.split(/\s+/);
    const processedWords: string[] = [];
    let hebrewBuffer: string[] = [];

    const flushHebrewBuffer = () => {
        if (hebrewBuffer.length > 0) {
            // Reverse word order for Hebrew segments and reverse characters within each word
            processedWords.push(...hebrewBuffer.map(w => w.split('').reverse().join('')).reverse());
            hebrewBuffer = [];
        }
    };

    for (const word of words) {
        if (/[\u0590-\u05FF]/.test(word)) {
            hebrewBuffer.push(word);
        } else {
            flushHebrewBuffer();
            processedWords.push(word);
        }
    }
    flushHebrewBuffer();

    return processedWords.join(' ').trim();
}
