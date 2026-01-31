'use server';

import { logger } from '@/lib/logger';

/**
 * Credit card SMS providers supported by the parser
 */
export type CardProvider = 'isracard' | 'cal' | 'max' | 'leumi' | 'unknown';

/**
 * Parsed SMS receipt data
 */
export interface ParsedSmsReceipt {
    is_valid: boolean;
    card_ending: string | null;
    merchant_name: string | null;
    amount: number | null;
    currency: string;
    transaction_date: string | null;  // YYYY-MM-DD format
    provider: CardProvider;
    raw_message: string;
    confidence: number;  // 100 for regex match, 80 for partial
}

/**
 * Provider-specific regex patterns for SMS parsing
 */
const PATTERNS: Record<CardProvider, {
    cardEnding: RegExp;
    amount: RegExp;
    merchant: RegExp;
    date?: RegExp;
}> = {
    isracard: {
        cardEnding: /בכרטיסך(?:\s+המסתיים\s+ב-)?\s*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)\s*(ש"ח|ILS)?/,
        merchant: /ב-?([^.]+?)(?:\s*\.|\s*למידע|$)/,
        date: /ב-?\s*(\d{1,2})\/(\d{1,2})/
    },
    cal: {
        cardEnding: /\*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)\s*ש"ח/,
        merchant: /ב-([^*]+?)(?:\s*\*|\s*$)/,
        date: /(\d{1,2})\/(\d{1,2})/
    },
    max: {
        cardEnding: /\*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)\s*ש"ח/,
        merchant: /ב([^*]+?)\s*\*/,
    },
    leumi: {
        cardEnding: /כרטיס\s*(\d{4})/,
        amount: /([\d,]+\.?\d*)\s*ש"ח/,
        merchant: /ש"ח\s*-\s*(.+?)(?:\s*$|\s*\.)/,
    },
    unknown: {
        cardEnding: /(\d{4})/,
        amount: /([\d,]+\.?\d*)\s*(ש"ח|ILS)/,
        merchant: /ב-?([א-ת\w\s.-]+)/,
    }
};

/**
 * SMS trigger phrases that indicate a credit card transaction
 */
const SMS_TRIGGERS = [
    'אושרה עסקה',
    'בוצעה עסקה',
    'עסקה אושרה',
    'בוצע חיוב',
    'חיוב בכרטיס'
];

/**
 * Check if text is a credit card SMS notification
 */
export function isCreditCardSms(text: string): boolean {
    return SMS_TRIGGERS.some(trigger => text.includes(trigger));
}

/**
 * Detect the credit card provider from SMS text
 */
export function detectProvider(text: string): CardProvider {
    const lower = text.toLowerCase();

    if (lower.includes('isracard') || text.includes('בכרטיסך')) {
        return 'isracard';
    }
    if (lower.includes('cal') || text.includes('ויזה כאל') || text.includes('כאל')) {
        return 'cal';
    }
    if (lower.includes('max') || text.includes('מקס')) {
        return 'max';
    }
    if (text.includes('לאומי קארד') || text.includes('לאומי card')) {
        return 'leumi';
    }

    return 'unknown';
}

/**
 * Parse amount string to number (handles Hebrew number formatting)
 */
function parseAmount(amountStr: string): number | null {
    if (!amountStr) return null;

    // Remove commas and convert to float
    const cleaned = amountStr.replace(/,/g, '').trim();
    const amount = parseFloat(cleaned);

    return isNaN(amount) ? null : amount;
}

/**
 * Parse date from SMS format (DD/MM) to YYYY-MM-DD
 * Assumes current year if month is <= current month, otherwise previous year
 */
function parseDate(day: string, month: string): string | null {
    if (!day || !month) return null;

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);

    if (isNaN(d) || isNaN(m) || d < 1 || d > 31 || m < 1 || m > 12) {
        return null;
    }

    const now = new Date();
    let year = now.getFullYear();

    // If the month is in the future, it's probably from last year
    if (m > now.getMonth() + 1) {
        year--;
    }

    // Format as YYYY-MM-DD
    return `${year}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

/**
 * Clean merchant name by removing common suffixes and trimming
 */
function cleanMerchantName(merchant: string | null): string | null {
    if (!merchant) return null;

    return merchant
        .trim()
        // Remove trailing dots and spaces
        .replace(/[\s.]+$/, '')
        // Remove common SMS suffixes
        .replace(/\s*למידע.*$/i, '')
        .replace(/\s*לפרטים.*$/i, '')
        .trim();
}

/**
 * Parse a credit card SMS message into structured data.
 * Uses regex patterns specific to each Israeli credit card provider.
 *
 * Supported providers:
 * - Isracard
 * - Visa Cal
 * - Max (Leumi Card)
 * - Leumi Card
 *
 * @param smsText - The raw SMS message text
 * @returns ParsedSmsReceipt with extracted transaction data
 */
export async function parseSmsReceipt(smsText: string): Promise<ParsedSmsReceipt> {
    const trimmedText = smsText.trim();

    // Check if this is a credit card SMS
    if (!isCreditCardSms(trimmedText)) {
        logger.info('[SMS Parse] Not a credit card SMS');
        return {
            is_valid: false,
            card_ending: null,
            merchant_name: null,
            amount: null,
            currency: 'ILS',
            transaction_date: null,
            provider: 'unknown',
            raw_message: trimmedText,
            confidence: 0
        };
    }

    // Detect provider
    const provider = detectProvider(trimmedText);
    const patterns = PATTERNS[provider];

    logger.info('[SMS Parse] Detected provider:', provider);

    // Extract card ending
    const cardMatch = trimmedText.match(patterns.cardEnding);
    const cardEnding = cardMatch ? cardMatch[1] : null;

    // Extract amount
    const amountMatch = trimmedText.match(patterns.amount);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;

    // Detect currency (ILS by default, check for explicit ILS marker)
    let currency = 'ILS';
    if (amountMatch && amountMatch[2]) {
        currency = amountMatch[2] === 'ILS' ? 'ILS' : 'ILS';
    }
    // Check for foreign currency indicators
    if (/USD|\$/.test(trimmedText)) currency = 'USD';
    else if (/EUR|€/.test(trimmedText)) currency = 'EUR';
    else if (/GBP|£/.test(trimmedText)) currency = 'GBP';

    // Extract date
    let transactionDate: string | null = null;
    if (patterns.date) {
        const dateMatch = trimmedText.match(patterns.date);
        if (dateMatch) {
            transactionDate = parseDate(dateMatch[1], dateMatch[2]);
        }
    }

    // If no date found, use today
    if (!transactionDate) {
        const now = new Date();
        transactionDate = now.toISOString().split('T')[0];
    }

    // Extract merchant name - this is trickier
    let merchantName: string | null = null;

    // Try provider-specific pattern first
    const merchantMatch = trimmedText.match(patterns.merchant);
    if (merchantMatch) {
        merchantName = cleanMerchantName(merchantMatch[1]);
    }

    // Special handling for BIT transactions
    if (!merchantName && /BIT|ביט/.test(trimmedText)) {
        if (/העברה\s*ב\s*BIT/i.test(trimmedText)) {
            merchantName = 'BIT Transfer';
        } else {
            merchantName = 'BIT';
        }
    }

    // Calculate confidence
    let confidence = 0;
    if (cardEnding) confidence += 30;
    if (amount !== null) confidence += 40;
    if (merchantName) confidence += 20;
    if (transactionDate) confidence += 10;

    const isValid = confidence >= 70;  // Need at least card + amount

    logger.info('[SMS Parse] Extracted:', {
        provider,
        cardEnding,
        amount,
        currency,
        merchantName,
        transactionDate,
        confidence,
        isValid
    });

    return {
        is_valid: isValid,
        card_ending: cardEnding,
        merchant_name: merchantName,
        amount,
        currency,
        transaction_date: transactionDate,
        provider,
        raw_message: trimmedText,
        confidence
    };
}

/**
 * Batch parse multiple SMS messages
 */
export async function parseSmsReceiptBatch(
    messages: string[]
): Promise<ParsedSmsReceipt[]> {
    return Promise.all(messages.map(msg => parseSmsReceipt(msg)));
}
