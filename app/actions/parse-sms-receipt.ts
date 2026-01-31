'use server';

import { logger } from '@/lib/logger';
import { isCreditCardSms, detectProvider } from '@/lib/sms-utils';
import type { CardProvider, ParsedSmsReceipt } from '@/lib/sms-utils';

// Note: Types and sync utilities are exported from @/lib/sms-utils
// Import directly from there for client-side usage

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
        // Amount pattern: handle line breaks between amount and currency
        amount: /בסך\s+([\d,]+\.?\d*)[\s\n]*(ש"ח|ILS)?/,
        // Merchant pattern: look for "באתר" or "ב-" prefix
        merchant: /(?:באתר\s+(?:אינטרנט\s+)?|ב-?)([א-ת\w][\sa-zA-Zא-ת.-]*?)(?:\s*[.،]|\s*למידע|$)/,
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
 * @param options - Optional parsing options
 * @param options.skipTriggerCheck - If true, skip the trigger phrase validation (useful when SMS is already detected from subject)
 * @returns ParsedSmsReceipt with extracted transaction data
 */
export async function parseSmsReceipt(
    smsText: string,
    options?: { skipTriggerCheck?: boolean }
): Promise<ParsedSmsReceipt> {
    const trimmedText = smsText.trim();
    const skipTriggerCheck = options?.skipTriggerCheck ?? false;

    // Check if this is a credit card SMS (unless we're told to skip this check)
    if (!skipTriggerCheck && !isCreditCardSms(trimmedText)) {
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

    if (skipTriggerCheck) {
        logger.info('[SMS Parse] Skipping trigger check (detected from subject)');
    }

    // Detect provider
    const provider = detectProvider(trimmedText);
    const patterns = PATTERNS[provider];

    logger.info('[SMS Parse] Detected provider:', provider);

    // Extract card ending - try provider pattern first, then generic fallbacks
    let cardEnding: string | null = null;
    const cardMatch = trimmedText.match(patterns.cardEnding);
    if (cardMatch) {
        cardEnding = cardMatch[1];
    } else {
        // Fallback patterns for card ending
        const fallbackCardPatterns = [
            /\*(\d{4})/,                    // *1234
            /כרטיס\s*(\d{4})/,              // כרטיס 1234
            /card\s*(\d{4})/i,              // card 1234
            /ending\s*(\d{4})/i,            // ending 1234
            /(\d{4})\s*אושר/,               // 1234 אושר (card before approved)
        ];
        for (const pattern of fallbackCardPatterns) {
            const match = trimmedText.match(pattern);
            if (match) {
                cardEnding = match[1];
                logger.info('[SMS Parse] Card ending found via fallback pattern');
                break;
            }
        }
    }

    // Extract amount - try provider pattern first, then generic fallbacks
    let amount: number | null = null;
    const amountMatch = trimmedText.match(patterns.amount);
    if (amountMatch) {
        amount = parseAmount(amountMatch[1]);
    } else {
        // Fallback patterns for amount
        const fallbackAmountPatterns = [
            /([\d,]+\.?\d*)\s*(?:ש"ח|ILS|₪)/,           // 123.45 ש"ח / ILS / ₪
            /(?:סכום|amount|sum)[:\s]*([\d,]+\.?\d*)/i, // סכום: 123.45 / amount: 123.45
            /₪\s*([\d,]+\.?\d*)/,                        // ₪ 123.45
        ];
        for (const pattern of fallbackAmountPatterns) {
            const match = trimmedText.match(pattern);
            if (match) {
                amount = parseAmount(match[1]);
                if (amount !== null) {
                    logger.info('[SMS Parse] Amount found via fallback pattern:', amount);
                    break;
                }
            }
        }
    }

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

    // Fallback patterns for merchant
    if (!merchantName) {
        const fallbackMerchantPatterns = [
            // "באתר אינטרנט ורדינון" - capture the merchant name after "אינטרנט"
            /באתר\s+אינטרנט\s+([א-ת\w][\sa-zA-Zא-ת.-]*?)(?:\s*[.،]|\s*למידע|$)/,
            // "באתר ורדינון" - capture after "באתר"
            /באתר\s+([א-ת\w][\sa-zA-Zא-ת.-]*?)(?:\s*[.،]|\s*למידע|$)/,
            // Generic merchant patterns
            /(?:merchant|בית עסק|חנות)[:\s]*([א-ת\w\s.-]+?)(?:\s*[,.\n]|$)/i,
            /(?:at|ב-?)\s*([א-ת]{2,}[א-ת\s.-]*?)(?:\s*[,.\n]|$)/,
        ];
        for (const pattern of fallbackMerchantPatterns) {
            const match = trimmedText.match(pattern);
            if (match) {
                merchantName = cleanMerchantName(match[1]);
                if (merchantName && merchantName.length >= 2) {
                    logger.info('[SMS Parse] Merchant found via fallback pattern:', merchantName);
                    break;
                }
            }
        }
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

    // Validation threshold: normally need card + amount (70), but if we detected from subject
    // we can be more lenient (just need amount - 40)
    const validationThreshold = skipTriggerCheck ? 40 : 70;
    const isValid = confidence >= validationThreshold;

    logger.info('[SMS Parse] Extracted:', {
        provider,
        cardEnding,
        amount,
        currency,
        merchantName,
        transactionDate,
        confidence,
        validationThreshold,
        isValid,
        rawMessagePreview: trimmedText.substring(0, 100)
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
