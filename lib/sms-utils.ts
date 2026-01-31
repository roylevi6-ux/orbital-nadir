/**
 * SMS parsing utility functions and types
 * These are client-safe utilities that don't require server actions
 */

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
    if (text.includes('לאומי קארד') || text.includes('לאומי card') || lower.includes('leumi')) {
        return 'leumi';
    }

    return 'unknown';
}
