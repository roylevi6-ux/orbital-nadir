'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import { ParsedReceipt, ReceiptItem } from '@/lib/types/receipt';

/**
 * Parse an email to extract receipt information using Gemini AI.
 * Supports Hebrew and English receipts.
 *
 * @param emailContent - HTML or plain text email body
 * @param subject - Email subject line
 * @returns ParsedReceipt with extracted data, or is_receipt: false if not a receipt
 */
export async function parseReceiptEmail(
    emailContent: string,
    subject: string | null
): Promise<ParsedReceipt> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        logger.error('[Receipt Parse] Missing GEMINI_API_KEY');
        return {
            is_receipt: false,
            merchant_name: null,
            amount: null,
            currency: 'ILS',
            receipt_date: null,
            items: [],
            confidence: 0
        };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Truncate very long emails to avoid token limits
    const truncatedContent = emailContent.substring(0, 15000);

    const prompt = `You are a receipt parser for a household finance app.
Analyze this email and determine if it's a purchase/payment receipt.

IMPORTANT: Support both Hebrew and English receipts.

If it IS a receipt, extract:
- merchant_name: The store/vendor name (clean, normalized - e.g., "Spotify" not "PAYPAL *SPOTIFY", "שופרסל" not "שופרסל דיל רמת גן")
- amount: Total amount paid (number only, no currency symbol)
- currency: ILS, USD, EUR, GBP, etc.
- receipt_date: Date of purchase in YYYY-MM-DD format
- items: Array of purchased items [{name: string, quantity?: number, price?: number}]
- confidence: Your confidence level 0-100

If it's NOT a receipt (newsletter, shipping update, marketing, password reset, etc.):
Return: { "is_receipt": false, "confidence": 95 }

Common receipt sources to recognize:
- PayPal receipts (extract the actual merchant, not "PayPal")
- Amazon order confirmations
- Apple/iTunes receipts
- Bank transfer confirmations (BIT, Paybox)
- Subscription renewals (Spotify, Netflix, etc.)
- Israeli stores (שופרסל, רמי לוי, etc.)

Return ONLY raw JSON, no markdown code blocks.

--- EMAIL SUBJECT ---
${subject || '(no subject)'}

--- EMAIL CONTENT ---
${truncatedContent}`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Strip markdown if present
        const cleanJson = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // Try to parse JSON
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(cleanJson);
        } catch {
            // Try to extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                logger.warn('[Receipt Parse] Failed to parse AI response:', text.substring(0, 200));
                return {
                    is_receipt: false,
                    merchant_name: null,
                    amount: null,
                    currency: 'ILS',
                    receipt_date: null,
                    items: [],
                    confidence: 0
                };
            }
        }

        // Validate and normalize the response
        const isReceipt = parsed.is_receipt !== false;
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 50;

        if (!isReceipt) {
            logger.debug('[Receipt Parse] Not a receipt, confidence:', confidence);
            return {
                is_receipt: false,
                merchant_name: null,
                amount: null,
                currency: 'ILS',
                receipt_date: null,
                items: [],
                confidence
            };
        }

        // Extract and validate fields
        const merchantName = typeof parsed.merchant_name === 'string' ? parsed.merchant_name : null;
        const amount = typeof parsed.amount === 'number' ? parsed.amount :
            typeof parsed.amount === 'string' ? parseFloat(parsed.amount) : null;
        const currency = typeof parsed.currency === 'string' ? parsed.currency.toUpperCase() : 'ILS';
        const receiptDate = typeof parsed.receipt_date === 'string' ? parsed.receipt_date : null;

        // Parse items array
        let items: ReceiptItem[] = [];
        if (Array.isArray(parsed.items)) {
            items = parsed.items
                .filter((item): item is Record<string, unknown> =>
                    typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).name === 'string'
                )
                .map(item => ({
                    name: item.name as string,
                    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
                    price: typeof item.price === 'number' ? item.price : undefined
                }));
        }

        logger.debug('[Receipt Parse] Extracted:', {
            merchant: merchantName,
            amount,
            currency,
            date: receiptDate,
            itemCount: items.length,
            confidence
        });

        return {
            is_receipt: true,
            merchant_name: merchantName,
            amount: amount && !isNaN(amount) ? amount : null,
            currency,
            receipt_date: receiptDate,
            items,
            confidence
        };

    } catch (error) {
        logger.error('[Receipt Parse] Gemini error:', error instanceof Error ? error.message : error);
        return {
            is_receipt: false,
            merchant_name: null,
            amount: null,
            currency: 'ILS',
            receipt_date: null,
            items: [],
            confidence: 0
        };
    }
}
