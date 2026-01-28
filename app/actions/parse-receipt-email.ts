'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import { ParsedReceipt, ReceiptItem } from '@/lib/types/receipt';

interface AttachmentData {
    pdfBase64?: string;
    imageBase64?: string;
    imageMimeType?: string;
}

const RECEIPT_PARSING_PROMPT = `You are analyzing an email to determine if it's a receipt, invoice, or payment confirmation.

Your task: Extract structured payment data if this is a receipt/invoice, or return is_receipt: false if it's not.

## WHAT IS A RECEIPT (return is_receipt: true)
- Invoice emails with amount and date (even if they link to a PDF)
- Payment confirmations (PayPal, Stripe, bank transfers)
- Subscription charges (Spotify, Netflix, AWS, Cloudflare, etc.)
- Order confirmations that show total charged
- Service invoices (SaaS, utilities, etc.)

## WHAT IS NOT A RECEIPT (return is_receipt: false)
- Marketing/promotional emails
- Shipping notifications (no payment info)
- Password reset emails
- Account activity alerts (login, security)
- Emails that only mention "view your invoice" without showing amount

## EXTRACTION RULES
1. merchant_name: Clean company name only (e.g., "Cloudflare" not "Cloudflare, Inc.")
2. amount: Final total as a number (e.g., 7.50 not "$7.50")
3. currency: 3-letter code (USD, EUR, ILS, GBP). Use $ = USD, € = EUR, ₪ = ILS, £ = GBP
4. receipt_date: YYYY-MM-DD format. Use the invoice/due/charge date shown.
5. items: Array of line items if visible, empty array [] if not listed

## RESPONSE FORMAT
Return ONLY valid JSON (no markdown, no explanation):
{
  "is_receipt": true,
  "merchant_name": "Cloudflare",
  "amount": 7.50,
  "currency": "USD",
  "receipt_date": "2026-01-28",
  "items": [{"name": "Workers Paid", "price": 5.00}],
  "confidence": 95
}

OR if not a receipt:
{
  "is_receipt": false,
  "confidence": 90
}`;

/**
 * Parse an email to extract receipt information using Gemini AI.
 * Supports Hebrew and English receipts.
 * Can process PDF attachments and images using Gemini's vision capabilities.
 */
export async function parseReceiptEmail(
    emailContent: string,
    subject: string | null,
    attachments?: AttachmentData
): Promise<ParsedReceipt> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        logger.error('[Receipt Parse] Missing GEMINI_API_KEY');
        throw new Error('GEMINI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Truncate very long emails to avoid token limits
    const truncatedContent = emailContent.substring(0, 15000);

    try {
        let result;

        // Check if we have a PDF attachment
        if (attachments?.pdfBase64) {
            const pdfSizeKB = Math.round(attachments.pdfBase64.length * 0.75 / 1024);
            logger.info('[Receipt Parse] Processing PDF attachment, size:', pdfSizeKB, 'KB');

            const parts = [
                { text: RECEIPT_PARSING_PROMPT },
                {
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: attachments.pdfBase64
                    }
                },
                { text: `\n\nSubject: ${subject || '(no subject)'}\n\nAnalyze the PDF above and extract receipt details.` }
            ];

            result = await model.generateContent(parts);
        }
        // Check if we have an image attachment
        else if (attachments?.imageBase64 && attachments?.imageMimeType) {
            logger.info('[Receipt Parse] Processing image attachment');

            const parts = [
                { text: RECEIPT_PARSING_PROMPT },
                {
                    inlineData: {
                        mimeType: attachments.imageMimeType,
                        data: attachments.imageBase64
                    }
                },
                { text: `\n\nSubject: ${subject || '(no subject)'}\n\nEmail body for context:\n${truncatedContent.substring(0, 2000)}` }
            ];

            result = await model.generateContent(parts);
        }
        // No attachments - parse email body only
        else {
            logger.info('[Receipt Parse] Processing email body only (no attachments)');

            const prompt = `${RECEIPT_PARSING_PROMPT}

Subject: ${subject || '(no subject)'}

Email content:
${truncatedContent}`;

            result = await model.generateContent(prompt);
        }

        const text = result.response.text();
        logger.info('[Receipt Parse] Gemini response:', text.substring(0, 300));

        // Strip markdown if present
        const cleanJson = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // Parse JSON response
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(cleanJson);
        } catch {
            // Try to extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                logger.error('[Receipt Parse] Failed to parse Gemini response as JSON:', text);
                throw new Error('Invalid JSON response from Gemini');
            }
        }

        // STRICT validation: is_receipt must be exactly true (boolean)
        const isReceipt = parsed.is_receipt === true;
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 50;

        if (!isReceipt) {
            logger.info('[Receipt Parse] Not a receipt, confidence:', confidence);
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

        // Extract and validate required fields
        const merchantName = typeof parsed.merchant_name === 'string' && parsed.merchant_name.trim()
            ? parsed.merchant_name.trim()
            : null;

        const rawAmount = parsed.amount;
        const amount = typeof rawAmount === 'number' ? rawAmount :
            typeof rawAmount === 'string' ? parseFloat(rawAmount) : null;

        const currency = typeof parsed.currency === 'string' && parsed.currency.length === 3
            ? parsed.currency.toUpperCase()
            : 'USD';

        const receiptDate = typeof parsed.receipt_date === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(parsed.receipt_date)
            ? parsed.receipt_date
            : null;

        // Parse items array
        let items: ReceiptItem[] = [];
        if (Array.isArray(parsed.items)) {
            items = parsed.items
                .filter((item): item is Record<string, unknown> =>
                    typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).name === 'string'
                )
                .map(item => ({
                    name: String(item.name),
                    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
                    price: typeof item.price === 'number' ? item.price : undefined
                }));
        }

        // Validate we have minimum required data for a useful receipt
        if (!merchantName && amount === null && !receiptDate) {
            logger.warn('[Receipt Parse] Receipt flagged true but missing all key data, treating as not a receipt');
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
            amount: amount !== null && !isNaN(amount) ? amount : null,
            currency,
            receipt_date: receiptDate,
            items,
            confidence
        };

    } catch (error) {
        logger.error('[Receipt Parse] Error:', error instanceof Error ? error.message : error);
        throw error;
    }
}
