'use server';

import { logger } from '@/lib/logger';
import { generateAIResponse } from '@/lib/ai/gemini-client';
import { isCreditCardSms, detectProvider } from '@/lib/sms-utils';
import type { CardProvider, ParsedSmsReceipt } from '@/lib/sms-utils';

// Note: Types and sync utilities are exported from @/lib/sms-utils
// Import directly from there for client-side usage

/**
 * AI-powered SMS parsing using Gemini
 * More robust than regex - handles format changes automatically
 */
async function parseWithAI(smsText: string): Promise<{
    card_ending: string | null;
    merchant_name: string | null;
    amount: number | null;
    currency: string;
    transaction_date: string | null;
    confidence: number;
}> {
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Extract transaction details from this Israeli credit card SMS notification.

SMS Text:
"""
${smsText}
"""

Extract these fields (return null if not found):
1. card_ending: Last 4 digits of the credit card (e.g., "8770")
2. merchant_name: The business/merchant name (clean, without prefixes like "ב-" or "באתר")
3. amount: Transaction amount as a number (e.g., 143.42)
4. currency: Currency code (ILS, USD, EUR, GBP) - default to ILS if ש"ח
5. transaction_date: Date in YYYY-MM-DD format. If only DD/MM given, use year ${new Date().getFullYear()}. If no date, use ${today}

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation. Example:
{"card_ending":"8770","merchant_name":"מנורה מבטחים","amount":143.42,"currency":"ILS","transaction_date":"2025-01-29"}`;

    try {
        const response = await generateAIResponse(prompt);

        // Clean up response - remove markdown code blocks if present
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(jsonStr);

        // Validate and normalize the response
        return {
            card_ending: parsed.card_ending ? String(parsed.card_ending) : null,
            merchant_name: parsed.merchant_name ? String(parsed.merchant_name).trim() : null,
            amount: typeof parsed.amount === 'number' ? parsed.amount :
                    typeof parsed.amount === 'string' ? parseFloat(parsed.amount) : null,
            currency: parsed.currency || 'ILS',
            transaction_date: parsed.transaction_date || today,
            confidence: 85 // AI extraction has good but not perfect confidence
        };
    } catch (error) {
        logger.error('[SMS Parse AI] Failed to parse AI response:', error);
        return {
            card_ending: null,
            merchant_name: null,
            amount: null,
            currency: 'ILS',
            transaction_date: today,
            confidence: 0
        };
    }
}

/**
 * Provider-specific regex patterns for SMS parsing (fast path)
 */
const PATTERNS: Record<CardProvider, {
    cardEnding: RegExp;
    amount: RegExp;
    merchant: RegExp;
    date?: RegExp;
}> = {
    isracard: {
        cardEnding: /בכרטיסך(?:\s+המסתיים\s+ב-)?\s*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)[\s\n]*(ש"ח|ILS)?/,
        merchant: /(?:ש"ח|ILS)\s+(?:באתר\s+(?:אינטרנט\s+)?|ב-?)([א-ת.a-zA-Z][\sא-תa-zA-Z\d."'-]*?)(?:\s*[.،]|\s*למידע|$)/,
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

function parseAmount(amountStr: string): number | null {
    if (!amountStr) return null;
    const cleaned = amountStr.replace(/,/g, '').trim();
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? null : amount;
}

function parseDate(day: string, month: string): string | null {
    if (!day || !month) return null;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    if (isNaN(d) || isNaN(m) || d < 1 || d > 31 || m < 1 || m > 12) return null;

    const now = new Date();
    let year = now.getFullYear();
    if (m > now.getMonth() + 1) year--;

    return `${year}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

function cleanMerchantName(merchant: string | null): string | null {
    if (!merchant) return null;
    return merchant
        .trim()
        .replace(/[\s.]+$/, '')
        .replace(/\s*למידע.*$/i, '')
        .replace(/\s*לפרטים.*$/i, '')
        .trim();
}

/**
 * Fast regex-based parsing (primary method)
 */
function parseWithRegex(smsText: string): {
    card_ending: string | null;
    merchant_name: string | null;
    amount: number | null;
    currency: string;
    transaction_date: string | null;
    provider: CardProvider;
    confidence: number;
} {
    const provider = detectProvider(smsText);
    const patterns = PATTERNS[provider];

    // Extract card ending
    let cardEnding: string | null = null;
    const cardMatch = smsText.match(patterns.cardEnding);
    if (cardMatch) {
        cardEnding = cardMatch[1];
    } else {
        const fallbackCardPatterns = [
            /\*(\d{4})/,
            /כרטיס\s*(\d{4})/,
            /card\s*(\d{4})/i,
            /(\d{4})\s*אושר/,
        ];
        for (const pattern of fallbackCardPatterns) {
            const match = smsText.match(pattern);
            if (match) {
                cardEnding = match[1];
                break;
            }
        }
    }

    // Extract amount
    let amount: number | null = null;
    const amountMatch = smsText.match(patterns.amount);
    if (amountMatch) {
        amount = parseAmount(amountMatch[1]);
    } else {
        const fallbackAmountPatterns = [
            /([\d,]+\.?\d*)\s*(?:ש"ח|ILS|₪)/,
            /(?:סכום|amount)[:\s]*([\d,]+\.?\d*)/i,
        ];
        for (const pattern of fallbackAmountPatterns) {
            const match = smsText.match(pattern);
            if (match) {
                amount = parseAmount(match[1]);
                if (amount !== null) break;
            }
        }
    }

    // Extract currency
    let currency = 'ILS';
    if (/USD|\$/.test(smsText)) currency = 'USD';
    else if (/EUR|€/.test(smsText)) currency = 'EUR';
    else if (/GBP|£/.test(smsText)) currency = 'GBP';

    // Extract date
    let transactionDate: string | null = null;
    if (patterns.date) {
        const dateMatch = smsText.match(patterns.date);
        if (dateMatch) {
            transactionDate = parseDate(dateMatch[1], dateMatch[2]);
        }
    }
    if (!transactionDate) {
        transactionDate = new Date().toISOString().split('T')[0];
    }

    // Extract merchant
    let merchantName: string | null = null;
    const merchantMatch = smsText.match(patterns.merchant);
    if (merchantMatch) {
        merchantName = cleanMerchantName(merchantMatch[1]);
    }

    // Fallback merchant patterns
    if (!merchantName) {
        const fallbackMerchantPatterns = [
            /(?:ש"ח|ILS)\s+ב-?([א-ת][\sא-תa-zA-Z\d.-]*?)(?:\s*[.،]|\s*למידע|$)/,
            /באתר\s+אינטרנט\s+([א-ת\w][\sא-תa-zA-Z\d.-]*?)(?:\s*[.،]|\s*למידע|$)/,
            /באתר\s+([א-ת\w][\sא-תa-zA-Z\d.-]*?)(?:\s*[.،]|\s*למידע|$)/,
        ];
        for (const pattern of fallbackMerchantPatterns) {
            const match = smsText.match(pattern);
            if (match) {
                merchantName = cleanMerchantName(match[1]);
                if (merchantName && merchantName.length >= 2) break;
            }
        }
    }

    // Special BIT handling
    if (!merchantName && /BIT|ביט/.test(smsText)) {
        merchantName = /העברה\s*ב\s*BIT/i.test(smsText) ? 'BIT Transfer' : 'BIT';
    }

    // Calculate confidence
    let confidence = 0;
    if (cardEnding) confidence += 30;
    if (amount !== null) confidence += 40;
    if (merchantName) confidence += 20;
    if (transactionDate) confidence += 10;

    return {
        card_ending: cardEnding,
        merchant_name: merchantName,
        amount,
        currency,
        transaction_date: transactionDate,
        provider,
        confidence
    };
}

/**
 * Parse a credit card SMS message into structured data.
 *
 * Strategy:
 * 1. Try fast regex parsing first
 * 2. If merchant is missing or confidence is low, use AI
 *
 * @param smsText - The raw SMS message text
 * @param options - Optional parsing options
 * @returns ParsedSmsReceipt with extracted transaction data
 */
export async function parseSmsReceipt(
    smsText: string,
    options?: { skipTriggerCheck?: boolean }
): Promise<ParsedSmsReceipt> {
    const trimmedText = smsText.trim();
    const skipTriggerCheck = options?.skipTriggerCheck ?? false;

    // Check if this is a credit card SMS
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

    // Try regex first (fast)
    const regexResult = parseWithRegex(trimmedText);
    logger.info('[SMS Parse] Regex result:', {
        ...regexResult,
        rawMessagePreview: trimmedText.substring(0, 80)
    });

    // If merchant is missing or confidence < 70, try AI
    const needsAI = !regexResult.merchant_name || regexResult.confidence < 70;

    if (needsAI) {
        logger.info('[SMS Parse] Falling back to AI parsing...');
        try {
            const aiResult = await parseWithAI(trimmedText);
            logger.info('[SMS Parse] AI result:', aiResult);

            // Merge: prefer AI values if regex missed them
            const merged = {
                card_ending: regexResult.card_ending || aiResult.card_ending,
                merchant_name: aiResult.merchant_name || regexResult.merchant_name,
                amount: regexResult.amount ?? aiResult.amount,
                currency: regexResult.currency !== 'ILS' ? regexResult.currency : aiResult.currency,
                transaction_date: regexResult.transaction_date || aiResult.transaction_date,
                provider: regexResult.provider,
                confidence: Math.max(regexResult.confidence, aiResult.confidence)
            };

            // Recalculate confidence for merged result
            let confidence = 0;
            if (merged.card_ending) confidence += 30;
            if (merged.amount !== null) confidence += 40;
            if (merged.merchant_name) confidence += 20;
            if (merged.transaction_date) confidence += 10;

            const validationThreshold = skipTriggerCheck ? 40 : 70;
            const isValid = confidence >= validationThreshold;

            logger.info('[SMS Parse] Final merged result:', {
                ...merged,
                confidence,
                isValid
            });

            return {
                is_valid: isValid,
                card_ending: merged.card_ending,
                merchant_name: merged.merchant_name,
                amount: merged.amount,
                currency: merged.currency,
                transaction_date: merged.transaction_date,
                provider: merged.provider,
                raw_message: trimmedText,
                confidence
            };
        } catch (error) {
            logger.warn('[SMS Parse] AI parsing failed, using regex result:', error);
        }
    }

    // Use regex result
    const validationThreshold = skipTriggerCheck ? 40 : 70;
    const isValid = regexResult.confidence >= validationThreshold;

    return {
        is_valid: isValid,
        card_ending: regexResult.card_ending,
        merchant_name: regexResult.merchant_name,
        amount: regexResult.amount,
        currency: regexResult.currency,
        transaction_date: regexResult.transaction_date,
        provider: regexResult.provider,
        raw_message: trimmedText,
        confidence: regexResult.confidence
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
