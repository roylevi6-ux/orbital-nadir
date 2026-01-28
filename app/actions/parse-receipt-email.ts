'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import { ParsedReceipt, ReceiptItem } from '@/lib/types/receipt';

interface AttachmentData {
    pdfBase64?: string;
    imageBase64?: string;
    imageMimeType?: string;
}

/**
 * Parse an email to extract receipt information using Gemini AI.
 * Supports Hebrew and English receipts.
 * Can process PDF attachments and images using Gemini's vision capabilities.
 *
 * @param emailContent - HTML or plain text email body
 * @param subject - Email subject line
 * @param attachments - Optional PDF or image attachment data (base64 encoded)
 * @returns ParsedReceipt with extracted data, or is_receipt: false if not a receipt
 */
export async function parseReceiptEmail(
    emailContent: string,
    subject: string | null,
    attachments?: AttachmentData
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
    // Use gemini-2.0-flash for multimodal support (PDF, images)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Truncate very long emails to avoid token limits
    const truncatedContent = emailContent.substring(0, 15000);

    const systemPrompt = `You are a receipt parser for a household finance app.
Analyze the provided content (email and/or attached PDF/image) and extract receipt information.

IMPORTANT: Support both Hebrew and English receipts.

If it IS a receipt, extract:
- merchant_name: The store/vendor name (clean, normalized - e.g., "Anthropic" not "Anthropic, PBC", "Spotify" not "PAYPAL *SPOTIFY", "שופרסל" not "שופרסל דיל רמת גן")
- amount: The FINAL total amount paid (number only, no currency symbol).
  CRITICAL: Look for "Amount paid", "Total", "סה"כ לתשלום", or the final bold total.
  Do NOT use subtotals, line items, or partial amounts.
  Example: If receipt shows "Subtotal $100, Credit -$15.17, Amount paid $84.83" -> use 84.83
- currency: ILS, USD, EUR, GBP, etc. (look for $ = USD, ₪ = ILS, € = EUR, £ = GBP)
- receipt_date: Date of purchase in YYYY-MM-DD format.
  CRITICAL: Extract the exact year shown on the receipt. If it says "January 26, 2026" -> "2026-01-26"
  Do NOT assume or default to any year - use what's printed on the receipt.
- items: Array of purchased items [{name: string, quantity?: number, price?: number}]
- confidence: Your confidence level 0-100

If it's NOT a receipt (newsletter, shipping update, marketing, password reset, etc.):
Return: { "is_receipt": false, "confidence": 95 }

Common receipt sources to recognize:
- PayPal receipts (extract the actual merchant, not "PayPal")
- Amazon order confirmations
- Apple/iTunes receipts
- Bank transfer confirmations (BIT, Paybox)
- Subscription renewals (Spotify, Netflix, Anthropic Claude, etc.)
- Israeli stores (שופרסל, רמי לוי, etc.)
- Service providers with Hebrew receipts

Return ONLY raw JSON, no markdown code blocks.`;

    try {
        let result;

        // Check if we have a PDF attachment
        if (attachments?.pdfBase64) {
            const pdfSizeKB = Math.round(attachments.pdfBase64.length * 0.75 / 1024);
            logger.info('[Receipt Parse] Processing PDF attachment, size:', pdfSizeKB, 'KB');

            // Gemini 1.5 supports PDFs directly via inlineData
            const parts = [
                { text: systemPrompt },
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: attachments.pdfBase64
                    }
                },
                { text: `\n\n--- EMAIL SUBJECT ---\n${subject || '(no subject)'}\n\nAnalyze the PDF attachment above carefully. Extract the receipt details.` }
            ];

            result = await model.generateContent(parts);
        }
        // Check if we have an image attachment
        else if (attachments?.imageBase64 && attachments?.imageMimeType) {
            logger.debug('[Receipt Parse] Processing image attachment');

            const parts = [
                { text: systemPrompt },
                {
                    inlineData: {
                        mimeType: attachments.imageMimeType,
                        data: attachments.imageBase64
                    }
                },
                { text: `\n\n--- EMAIL SUBJECT ---\n${subject || '(no subject)'}\n\n--- EMAIL BODY (for context) ---\n${truncatedContent.substring(0, 2000)}` }
            ];

            result = await model.generateContent(parts);
        }
        // No attachments - parse email body only
        else {
            logger.debug('[Receipt Parse] Processing email body only (no attachments)');

            const prompt = `${systemPrompt}

--- EMAIL SUBJECT ---
${subject || '(no subject)'}

--- EMAIL CONTENT ---
${truncatedContent}`;

            result = await model.generateContent(prompt);
        }

        const text = result.response.text();

        // Log raw response for debugging
        logger.debug('[Receipt Parse] Raw Gemini response:', text.substring(0, 500));

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

        logger.info('[Receipt Parse] Extracted:', {
            merchant: merchantName,
            amount,
            currency,
            date: receiptDate,
            itemCount: items.length,
            confidence,
            hadPdf: !!attachments?.pdfBase64,
            hadImage: !!attachments?.imageBase64
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
