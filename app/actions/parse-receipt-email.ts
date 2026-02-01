'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import { ParsedReceipt, ReceiptItem } from '@/lib/types/receipt';

interface AttachmentData {
    pdfBase64?: string;
    imageBase64?: string;
    imageMimeType?: string;
}

// Known invoice platform patterns
interface InvoicePlatformPattern {
    name: string;
    senderPatterns: RegExp[];
    subjectPatterns: RegExp[];
    invoiceNumberPattern?: RegExp;
    extractMerchant?: (subject: string, body: string, senderName?: string) => string | null;
}

const INVOICE_PLATFORMS: InvoicePlatformPattern[] = [
    {
        name: 'iCount',
        senderPatterns: [/@icount\.co\.il$/i, /icount/i],
        subjectPatterns: [/חשבונית\s*(מס)?\s*(קבלה|עסקה)?\s*(מספר)?\s*\d+/i],
        invoiceNumberPattern: /מספר\s*(\d+)/,
        extractMerchant: (_subject, _body, senderName) => {
            // iCount sends on behalf of merchants - the merchant is in the sender display name
            if (senderName && !senderName.includes('icount')) {
                return senderName.trim();
            }
            return null;
        }
    },
    {
        name: 'Invoice4U',
        senderPatterns: [/@invoice4u\.co\.il$/i, /invoice4u/i],
        subjectPatterns: [/חשבונית|קבלה|invoice/i],
        invoiceNumberPattern: /(?:מס[\'']?|#|מספר)\s*(\d+)/i
    },
    {
        name: 'GreenInvoice',
        senderPatterns: [/@greeninvoice\.co\.il$/i, /greeninvoice/i],
        subjectPatterns: [/חשבונית|קבלה|invoice/i],
        invoiceNumberPattern: /(?:מס[\'']?|#|מספר)\s*(\d+)/i
    },
    {
        name: 'PayPal',
        senderPatterns: [/@paypal\.com$/i, /paypal/i],
        subjectPatterns: [/receipt|payment|confirmation|קבלה/i],
        extractMerchant: (_subject, body) => {
            // PayPal emails often have "You sent/received payment to/from X"
            const match = body.match(/(?:to|from|ל|מ)\s+([A-Za-zא-ת\s.-]+?)(?:\s+for|\s+עבור|\.)/i);
            return match ? match[1].trim() : 'PayPal';
        }
    }
];

/**
 * Extract invoice number from subject line
 */
function extractInvoiceNumber(subject: string): string | null {
    // Try common patterns
    const patterns = [
        /(?:invoice|חשבונית|קבלה)\s*(?:מס[\'']?|#|מספר|number)?\s*[:.]?\s*(\d+)/i,
        /#(\d+)/,
        /מספר\s*(\d+)/
    ];

    for (const pattern of patterns) {
        const match = subject.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Extract sender display name from "Name <email>" format
 */
function extractSenderName(from: string): string | null {
    // Format: "Display Name <email@domain.com>"
    const match = from.match(/^([^<]+)\s*</);
    if (match) {
        return match[1].trim().replace(/["']/g, '');
    }
    return null;
}

/**
 * Try pattern-based extraction for known invoice platforms
 * Returns parsed receipt if successful, null if platform not recognized or extraction failed
 */
function tryPatternExtraction(
    emailContent: string,
    subject: string,
    senderEmail: string,
    senderName: string | null
): ParsedReceipt | null {
    // Check each known platform
    for (const platform of INVOICE_PLATFORMS) {
        // Check if sender matches
        const senderMatches = platform.senderPatterns.some(p => p.test(senderEmail));

        // Check if subject matches
        const subjectMatches = platform.subjectPatterns.some(p => p.test(subject));

        if (senderMatches || subjectMatches) {
            logger.info('[Receipt Parse] Detected invoice platform:', platform.name);

            // Extract invoice number
            const invoiceNumber = platform.invoiceNumberPattern
                ? subject.match(platform.invoiceNumberPattern)?.[1]
                : extractInvoiceNumber(subject);

            // Extract merchant
            let merchantName: string | null = null;
            if (platform.extractMerchant) {
                merchantName = platform.extractMerchant(subject, emailContent, senderName || undefined);
            }

            // If we at least have the platform recognized, mark as receipt
            // Even without amount, the invoice can be matched later
            if (invoiceNumber || merchantName || subjectMatches) {
                logger.info('[Receipt Parse] Pattern extraction:', {
                    platform: platform.name,
                    invoiceNumber,
                    merchant: merchantName,
                    senderName
                });

                return {
                    is_receipt: true,
                    merchant_name: merchantName || senderName || platform.name,
                    amount: null, // Will need to be extracted from PDF or matched with transaction
                    currency: 'ILS',
                    receipt_date: new Date().toISOString().split('T')[0],
                    items: [],
                    confidence: merchantName ? 70 : 50, // Lower confidence when we don't have full data
                    // Store additional metadata
                    invoice_number: invoiceNumber,
                    invoice_platform: platform.name
                } as ParsedReceipt & { invoice_number?: string; invoice_platform?: string };
            }
        }
    }

    return null;
}

/**
 * Try to extract amount from HTML content
 */
function tryExtractAmount(content: string): number | null {
    // Common patterns for amounts in Hebrew/English
    const patterns = [
        // ₪123.45 or ₪ 123.45
        /₪\s*([\d,]+\.?\d*)/,
        // 123.45 ש"ח or 123.45ש"ח
        /([\d,]+\.?\d*)\s*ש"ח/,
        // ILS 123.45
        /ILS\s*([\d,]+\.?\d*)/i,
        // Total: $123.45
        /total[:\s]*([\$€£]?)\s*([\d,]+\.?\d*)/i,
        // סה"כ: 123.45
        /סה"כ[:\s]*([\d,]+\.?\d*)/,
        // לתשלום: 123.45
        /לתשלום[:\s]*([\d,]+\.?\d*)/
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            // Get the last capture group (the number)
            const numStr = match[match.length - 1] || match[1];
            const amount = parseFloat(numStr.replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0) {
                return amount;
            }
        }
    }
    return null;
}

const RECEIPT_PARSING_PROMPT = `You are analyzing an email to determine if it's a receipt, invoice, or payment confirmation.

Your task: Extract structured payment data if this is a receipt/invoice, or return is_receipt: false if it's not.

## WHAT IS A RECEIPT (return is_receipt: true)
- Invoice emails with amount and date (even if they link to a PDF)
- Payment confirmations (PayPal, Stripe, bank transfers)
- Subscription charges (Spotify, Netflix, AWS, Cloudflare, etc.)
- Order confirmations that show total charged
- Service invoices (SaaS, utilities, etc.)
- Emails with "חשבונית" (invoice) or "קבלה" (receipt) in subject - these ARE receipts even if they just link to view
- iCount, Invoice4U, GreenInvoice emails - these ARE receipts

## WHAT IS NOT A RECEIPT (return is_receipt: false)
- Marketing/promotional emails
- Shipping notifications (no payment info)
- Password reset emails
- Account activity alerts (login, security)

## EXTRACTION RULES
1. merchant_name: The business/vendor name. For invoice platforms (iCount, Invoice4U), this is the ACTUAL merchant, not the platform name.
   - Look for "from" or "מאת" fields
   - Check email sender display name
   - Extract from invoice header
2. amount: Final total as a number (e.g., 7.50 not "$7.50"). If not visible, return null.
3. currency: 3-letter code (USD, EUR, ILS, GBP). Use $ = USD, € = EUR, ₪ = ILS, £ = GBP
4. receipt_date: YYYY-MM-DD format. Use the invoice/due/charge date shown. If not found, use null.
5. items: Array of line items if visible, empty array [] if not listed
6. invoice_number: Extract invoice number if present (e.g., "חשבונית מספר 4513" → "4513")

## RESPONSE FORMAT
Return ONLY valid JSON (no markdown, no explanation):
{
  "is_receipt": true,
  "merchant_name": "מכון ארד",
  "amount": 450.00,
  "currency": "ILS",
  "receipt_date": "2026-01-28",
  "items": [],
  "invoice_number": "4513",
  "confidence": 95
}

OR if not a receipt:
{
  "is_receipt": false,
  "confidence": 90
}`;

/**
 * Parse an email to extract receipt information.
 * Uses a two-phase approach:
 * 1. Try pattern-based extraction for known invoice platforms (fast)
 * 2. Fall back to Gemini AI for complex/unknown formats
 *
 * Supports Hebrew and English receipts.
 * Can process PDF attachments and images using Gemini's vision capabilities.
 */
export async function parseReceiptEmail(
    emailContent: string,
    subject: string | null,
    attachments?: AttachmentData,
    senderEmail?: string
): Promise<ParsedReceipt> {
    const safeSubject = subject || '';
    const safeSender = senderEmail || '';
    const senderName = extractSenderName(safeSender);

    logger.info('[Receipt Parse] Starting parse:', {
        subject: safeSubject.substring(0, 50),
        sender: safeSender,
        senderName,
        hasBody: !!emailContent,
        bodyLength: emailContent?.length || 0,
        hasPdf: !!attachments?.pdfBase64,
        hasImage: !!attachments?.imageBase64
    });

    // Phase 1: Try pattern-based extraction for known platforms
    const patternResult = tryPatternExtraction(emailContent, safeSubject, safeSender, senderName);

    if (patternResult) {
        // Try to extract amount from body if not found
        if (patternResult.amount === null) {
            const extractedAmount = tryExtractAmount(emailContent);
            if (extractedAmount) {
                patternResult.amount = extractedAmount;
                patternResult.confidence = Math.min(patternResult.confidence + 20, 90);
            }
        }

        // If we have good enough data from patterns, return early
        // But if we have a PDF, still process it for better extraction
        if (patternResult.merchant_name && !attachments?.pdfBase64) {
            logger.info('[Receipt Parse] Pattern extraction successful:', patternResult);
            return patternResult;
        }

        // Store pattern result as fallback
        logger.info('[Receipt Parse] Pattern gave partial data, trying AI...');
    }

    // Phase 2: Use Gemini AI
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        logger.error('[Receipt Parse] Missing GEMINI_API_KEY');
        // Return pattern result if available, otherwise throw
        if (patternResult) return patternResult;
        throw new Error('GEMINI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Truncate very long emails to avoid token limits
    const truncatedContent = emailContent.substring(0, 15000);

    try {
        let result;

        // Include sender info in prompt for better extraction
        const contextInfo = `
Sender: ${safeSender}
Sender Display Name: ${senderName || '(not available)'}
Subject: ${safeSubject}
`;

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
                { text: `\n\n${contextInfo}\n\nAnalyze the PDF above and extract receipt details.` }
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
                { text: `\n\n${contextInfo}\n\nEmail body for context:\n${truncatedContent.substring(0, 2000)}` }
            ];

            result = await model.generateContent(parts);
        }
        // No attachments - parse email body only
        else {
            logger.info('[Receipt Parse] Processing email body only (no attachments)');

            const prompt = `${RECEIPT_PARSING_PROMPT}

${contextInfo}

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
                // Return pattern result if available
                if (patternResult) return patternResult;
                throw new Error('Invalid JSON response from Gemini');
            }
        }

        // STRICT validation: is_receipt must be exactly true (boolean)
        const isReceipt = parsed.is_receipt === true;
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 50;

        if (!isReceipt) {
            logger.info('[Receipt Parse] AI says not a receipt, confidence:', confidence);
            // If pattern said it was a receipt but AI disagrees, trust pattern for known platforms
            if (patternResult && patternResult.is_receipt) {
                logger.info('[Receipt Parse] Pattern detected receipt, overriding AI');
                return patternResult;
            }
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
            : patternResult?.merchant_name || null;

        const rawAmount = parsed.amount;
        let amount = typeof rawAmount === 'number' ? rawAmount :
            typeof rawAmount === 'string' ? parseFloat(rawAmount) : null;

        // Fall back to pattern-extracted amount
        if (amount === null && patternResult?.amount) {
            amount = patternResult.amount;
        }

        const currency = typeof parsed.currency === 'string' && parsed.currency.length === 3
            ? parsed.currency.toUpperCase()
            : 'ILS';

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
            logger.warn('[Receipt Parse] Receipt flagged true but missing all key data');
            // Return pattern result if available
            if (patternResult) return patternResult;
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
        // Return pattern result if available
        if (patternResult) {
            logger.info('[Receipt Parse] AI failed, returning pattern result');
            return patternResult;
        }
        throw error;
    }
}
