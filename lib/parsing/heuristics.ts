/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse, format, isValid } from 'date-fns';
import { ColumnMapping } from './types';

export function normalizeDate(dateStr: string): string | null {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();

    // Excel serial date (numeric string) handling could be added here if needed,
    // but xlsx typically handles it if configured right.

    const formats = ['dd/MM/yyyy', 'd/M/yyyy', 'dd.MM.yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd.MM.yy', 'dd/MM/yy'];

    for (const fmt of formats) {
        const d = parse(cleanStr, fmt, new Date());
        if (isValid(d)) {
            // Fix for 2-digit years parsed as 00XX
            const year = d.getFullYear();
            if (year < 100) {
                d.setFullYear(year + 2000);
            }
            return format(d, 'yyyy-MM-dd');
        }
    }
    return null;
}

export const HEURISTIC_KEYWORDS = {
    date: ['date', 'time', 'תאריך', 'יום', 'מועד'],
    description: ['description', 'details', 'name', 'merchant', 'payee', 'פרטים', 'שם', 'בית עסק', 'תיאור', 'הערות'],
    amount: ['amount', 'sum', 'total', 'price', 'value', 'סכום', 'סך הכל', 'מחיר', 'ערך'],
    amount_billing: ['billing amount', 'charge amount', 'סכום לחיוב', 'חיוב בפועל', 'סכום חיוב', 'סכום לתשלום'],
    amount_transaction: ['transaction amount', 'deal amount', 'סכום עסקה', 'סכום מקורי'],
    credit: ['credit', 'income', 'deposit', 'זכות', 'הכנסה'],
    debit: ['debit', 'expense', 'withdrawal', 'outcome', 'חובה', 'הוצאה'],
    balance: ['balance', 'iterah', 'יתרה'],
    currency: ['currency', 'מטבע', 'סוג מטבע']
};

/**
 * Currency indicators to detect from file content
 */
export const CURRENCY_INDICATORS: Record<string, string[]> = {
    ILS: ['₪', 'ils', 'nis', 'שקל', 'שקלים', 'ש"ח', 'ש״ח', 'shekel'],
    USD: ['$', 'usd', 'dollar', 'דולר'],
    EUR: ['€', 'eur', 'euro', 'אירו'],
    GBP: ['£', 'gbp', 'pound', 'לירה שטרלינג']
};

/**
 * Detect currency from file content or headers
 * @param content - Text content to analyze (can be headers, rows, or full text)
 * @returns Detected currency code or 'ILS' as default
 */
export function detectCurrency(content: string): string {
    const lowerContent = content.toLowerCase();

    // Check for currency indicators in priority order
    for (const [currency, indicators] of Object.entries(CURRENCY_INDICATORS)) {
        for (const indicator of indicators) {
            if (content.includes(indicator) || lowerContent.includes(indicator)) {
                return currency;
            }
        }
    }

    // Default to ILS for Israeli bank statements
    return 'ILS';
}

/**
 * Detect currency from headers and first few data rows
 */
export function detectCurrencyFromData(headers: string[], rows: unknown[][]): string {
    // Check headers first
    const headerText = headers.join(' ');
    const headerCurrency = detectCurrency(headerText);
    if (headerCurrency !== 'ILS') return headerCurrency;

    // Check first 5 data rows
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const rowText = rows[i]?.map(cell => String(cell || '')).join(' ') || '';
        const rowCurrency = detectCurrency(rowText);
        if (rowCurrency !== 'ILS') return rowCurrency;
    }

    // Default to ILS
    return 'ILS';
}

export function detectColumnMapping(headers: string[]): Partial<ColumnMapping> {
    const mapping: Partial<ColumnMapping> = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    // Helper to find best match
    const findMatch = (keywords: string[]) => {
        return headers.find((h, i) => {
            const normalized = normalizedHeaders[i];
            return keywords.some(k => normalized.includes(k));
        });
    };

    mapping.date = findMatch(HEURISTIC_KEYWORDS.date);
    mapping.description = findMatch(HEURISTIC_KEYWORDS.description);

    // Amount priority: 
    // 1. Billing vs Transaction (CC)
    // 2. Credit vs Debit (Bank)
    // 3. Single Amount column

    mapping.amount_billing = findMatch(HEURISTIC_KEYWORDS.amount_billing);
    mapping.amount_transaction = findMatch(HEURISTIC_KEYWORDS.amount_transaction);

    const creditCol = findMatch(HEURISTIC_KEYWORDS.credit);
    const debitCol = findMatch(HEURISTIC_KEYWORDS.debit);

    if (creditCol && debitCol) {
        mapping.credit = creditCol;
        mapping.debit = debitCol;
    }

    // Always try to find generic amount too, as fallback
    mapping.amount = findMatch(HEURISTIC_KEYWORDS.amount) || 'Amount';

    return mapping;
}

/**
 * Scans the first N rows to find the one that looks most like a header row.
 * Returns the index of the header row, or 0 if not found.
 */
export function findHeaderRow(rows: any[][]): number {
    let bestScore = 0;
    let bestIndex = 0;

    // Check first 15 rows
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;

        const rowStr = row.map(c => String(c).toLowerCase()).join(' ');
        let score = 0;

        // Check for presence of keywords
        Object.values(HEURISTIC_KEYWORDS).flat().forEach(keyword => {
            if (rowStr.includes(keyword)) score++;
        });

        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    return bestIndex; // Default to 0 if no clear winner
}
