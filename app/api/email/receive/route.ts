import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth/server';
import { parseReceiptEmail } from '@/app/actions/parse-receipt-email';
import { storeReceipt } from '@/app/actions/store-receipt';
import { matchReceiptToTransaction } from '@/app/actions/match-receipts';
import { enrichTransactionFromReceipt } from '@/app/actions/enrich-transaction';
import { logger } from '@/lib/logger';
import { Webhook } from 'svix';

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
// RESEND_API_KEY is needed to fetch attachment content from Resend API
// Also check EMAIL_SERVICE_API_KEY as fallback (common Resend env var name)
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.EMAIL_SERVICE_API_KEY;

// Resend webhook attachment metadata (content not included - must fetch via API)
interface ResendAttachmentMeta {
    id: string;
    filename: string;
    content_type: string;
    content_disposition?: string;
    content_id?: string;
}

// Downloaded attachment with content
interface EmailAttachment {
    filename: string;
    content: string; // base64 encoded
    content_type: string;
}

/**
 * Fetch email content (html/text body) from Resend API.
 * Resend webhooks only include metadata, not the actual email body!
 * We must fetch it via GET /emails/receiving/{email_id}
 */
async function fetchEmailContent(emailId: string): Promise<{ html?: string; text?: string } | null> {
    if (!RESEND_API_KEY) {
        logger.error('[Email Webhook] Missing RESEND_API_KEY for email content fetch');
        return null;
    }

    try {
        const response = await fetch(
            `https://api.resend.com/emails/receiving/${emailId}`,
            {
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('[Email Webhook] Failed to fetch email content:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        logger.info('[Email Webhook] Email content fetched, hasHtml:', !!data.html, 'hasText:', !!data.text);

        return {
            html: data.html || undefined,
            text: data.text || undefined
        };
    } catch (error) {
        logger.error('[Email Webhook] Error fetching email content:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Fetch attachment content from Resend API.
 * Resend webhooks only include attachment metadata, not the actual content.
 *
 * Two-step process:
 * 1. GET /emails/receiving/{email_id}/attachments/{attachment_id} → returns { download_url }
 * 2. Fetch content from download_url → binary data → base64
 */
async function fetchAttachmentContent(emailId: string, attachmentId: string): Promise<string | null> {
    if (!RESEND_API_KEY) {
        logger.error('[Email Webhook] Missing RESEND_API_KEY for attachment download');
        return null;
    }

    try {
        // Step 1: Get attachment metadata with download URL
        // IMPORTANT: Use /emails/receiving/ for INBOUND emails (not /emails/)
        const metaResponse = await fetch(
            `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
            {
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`
                }
            }
        );

        if (!metaResponse.ok) {
            const errorText = await metaResponse.text();
            logger.error('[Email Webhook] Failed to get attachment metadata:', metaResponse.status, errorText);
            return null;
        }

        const metadata = await metaResponse.json();
        logger.info('[Email Webhook] Attachment metadata:', {
            id: metadata.id,
            filename: metadata.filename,
            hasDownloadUrl: !!metadata.download_url
        });

        if (!metadata.download_url) {
            logger.error('[Email Webhook] No download_url in attachment response');
            return null;
        }

        // Step 2: Download actual content from CDN URL
        const contentResponse = await fetch(metadata.download_url);
        if (!contentResponse.ok) {
            logger.error('[Email Webhook] Failed to download attachment content:', contentResponse.status);
            return null;
        }

        // Convert binary to base64
        const buffer = await contentResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        logger.info('[Email Webhook] Attachment downloaded, size:', Math.round(buffer.byteLength / 1024), 'KB');
        return base64;

    } catch (error) {
        logger.error('[Email Webhook] Error fetching attachment:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Verify Resend webhook signature using Svix.
 * Resend uses Svix for webhooks, which requires svix-id, svix-timestamp, and svix-signature headers.
 */
function verifyWebhook(payload: string, headers: Headers): { verified: boolean; data?: unknown } {
    if (!WEBHOOK_SECRET) {
        logger.warn('[Email Webhook] No RESEND_WEBHOOK_SECRET configured, skipping verification');
        return { verified: true, data: JSON.parse(payload) };
    }

    const svixId = headers.get('svix-id');
    const svixTimestamp = headers.get('svix-timestamp');
    const svixSignature = headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        logger.warn('[Email Webhook] Missing Svix headers');
        return { verified: false };
    }

    try {
        const wh = new Webhook(WEBHOOK_SECRET);
        const data = wh.verify(payload, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        });
        return { verified: true, data };
    } catch (err) {
        logger.warn('[Email Webhook] Svix verification failed:', err instanceof Error ? err.message : err);
        return { verified: false };
    }
}

/**
 * Extract household token from email address.
 * Format: receipts+{token}@domain.app
 */
function extractTokenFromEmail(toAddress: string): string | null {
    // Handle both formats: "receipts+abc123@domain.app" and "Name <receipts+abc123@domain.app>"
    const match = toAddress.match(/receipts\+([a-f0-9]+)@/i);
    return match ? match[1] : null;
}

/**
 * POST /api/email/receive
 * Webhook handler for inbound emails from Cloudflare Email Workers or Resend.
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const isCloudflare = request.headers.get('x-cloudflare-email-worker') === 'true';
        const rawBody = await request.text();

        let from: string;
        let to: string;
        let subject: string;
        let emailContent: string;
        let pdfAttachment: EmailAttachment | undefined;
        let imageAttachment: EmailAttachment | undefined;

        if (isCloudflare) {
            // Cloudflare Email Worker format
            const payload = JSON.parse(rawBody);
            from = payload.from || '';
            to = payload.to || '';
            subject = payload.subject || '';

            // Parse raw email to extract body
            const rawEmail = payload.rawEmail || '';
            const bodyStart = rawEmail.indexOf('\r\n\r\n');
            emailContent = bodyStart > -1 ? rawEmail.substring(bodyStart + 4) : rawEmail;

            logger.debug('[Email Webhook] Cloudflare email received:', { from, to, subject: subject?.substring(0, 50) });
        } else {
            // Resend webhook format - uses Svix for signatures
            const verification = verifyWebhook(rawBody, request.headers);
            if (!verification.verified) {
                logger.warn('[Email Webhook] Invalid signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }

            const payload = verification.data as { type: string; data: Record<string, unknown> };
            const { type, data } = payload;

            // Only handle inbound emails
            if (type !== 'email.received') {
                logger.debug('[Email Webhook] Ignoring event type:', type);
                return NextResponse.json({ status: 'ignored', reason: 'not_inbound_email' });
            }

            // Resend sends 'from' and 'to' as either string or array
            const fromRaw = data.from;
            from = Array.isArray(fromRaw) ? fromRaw[0] : (fromRaw as string) || '';

            const toRaw = data.to;
            to = Array.isArray(toRaw) ? toRaw[0] : (toRaw as string) || '';

            subject = (data.subject as string) || '';

            // Resend may use 'email_id' or 'id' for the email identifier
            const emailId = (data.email_id || data.id) as string | undefined;

            // Try to get email content from webhook payload first
            emailContent = (data.html as string) || (data.text as string) || '';

            // IMPORTANT: Resend webhooks often DON'T include html/text body!
            // If missing, we must fetch it via the API
            if (!emailContent && emailId) {
                logger.info('[Email Webhook] No email body in webhook, fetching via API...');
                const fetchedContent = await fetchEmailContent(emailId);
                if (fetchedContent) {
                    emailContent = fetchedContent.html || fetchedContent.text || '';
                }
            }

            // Extract attachments from Resend payload
            // IMPORTANT: Resend webhooks only include attachment METADATA, not content!
            // We must fetch the actual content via the Resend Attachments API
            const attachmentsMeta = data.attachments as ResendAttachmentMeta[] | undefined;

            logger.info('[Email Webhook] Resend email received:', {
                from,
                to,
                subject: subject?.substring(0, 50),
                emailId,
                attachmentCount: attachmentsMeta?.length || 0,
                hasBody: !!emailContent,
                bodyLength: emailContent?.length || 0
            });

            if (attachmentsMeta && attachmentsMeta.length > 0 && emailId) {
                // Find first PDF attachment metadata
                const pdfMeta = attachmentsMeta.find(a =>
                    a.content_type === 'application/pdf' ||
                    a.filename?.toLowerCase().endsWith('.pdf')
                );

                if (pdfMeta) {
                    logger.info('[Email Webhook] Fetching PDF attachment:', pdfMeta.filename);
                    const pdfContent = await fetchAttachmentContent(emailId, pdfMeta.id);
                    if (pdfContent) {
                        pdfAttachment = {
                            filename: pdfMeta.filename,
                            content: pdfContent,
                            content_type: pdfMeta.content_type
                        };
                        logger.info('[Email Webhook] PDF attachment fetched successfully');
                    }
                }

                // Find first image attachment (if no PDF)
                if (!pdfAttachment) {
                    const imageMeta = attachmentsMeta.find(a =>
                        a.content_type?.startsWith('image/') ||
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(a.filename || '')
                    );

                    if (imageMeta) {
                        logger.info('[Email Webhook] Fetching image attachment:', imageMeta.filename);
                        const imageContent = await fetchAttachmentContent(emailId, imageMeta.id);
                        if (imageContent) {
                            imageAttachment = {
                                filename: imageMeta.filename,
                                content: imageContent,
                                content_type: imageMeta.content_type
                            };
                        }
                    }
                }
            }

            logger.debug('[Email Webhook] Attachment processing complete:', {
                hasPdf: !!pdfAttachment,
                hasImage: !!imageAttachment
            });
        }

        // Extract household token from "to" address
        const token = extractTokenFromEmail(to);
        if (!token) {
            logger.warn('[Email Webhook] Invalid recipient format:', to);
            return NextResponse.json({ error: 'Invalid recipient format' }, { status: 400 });
        }

        // Look up household by token
        const adminClient = createAdminClient();
        const { data: household, error: hhError } = await adminClient
            .from('households')
            .select('id')
            .eq('receipt_token', token)
            .single();

        if (hhError || !household) {
            logger.warn('[Email Webhook] Unknown token:', token);
            return NextResponse.json({ error: 'Unknown household token' }, { status: 404 });
        }

        const householdId = household.id;
        logger.debug('[Email Webhook] Found household:', householdId);

        // Parse the email content with AI (including attachments if present)
        const parsed = await parseReceiptEmail(emailContent, subject, {
            pdfBase64: pdfAttachment?.content,
            imageBase64: imageAttachment?.content,
            imageMimeType: imageAttachment?.content_type
        });

        // If not a receipt, discard silently
        if (!parsed.is_receipt) {
            logger.info('[Email Webhook] Non-receipt email discarded from:', from, 'subject:', subject?.substring(0, 30));
            return NextResponse.json({
                status: 'discarded',
                reason: 'not_a_receipt',
                confidence: parsed.confidence
            });
        }

        // Store the parsed receipt
        const receiptId = await storeReceipt({
            household_id: householdId,
            sender_email: from,
            raw_subject: subject,
            raw_email_body: emailContent.substring(0, 10000), // Truncate
            is_receipt: true,
            merchant_name: parsed.merchant_name,
            amount: parsed.amount,
            currency: parsed.currency,
            receipt_date: parsed.receipt_date,
            items: parsed.items,
            confidence: parsed.confidence
        });

        if (!receiptId) {
            logger.error('[Email Webhook] Failed to store receipt');
            return NextResponse.json({ error: 'Failed to store receipt' }, { status: 500 });
        }

        // Attempt to match with existing transaction
        const match = await matchReceiptToTransaction(receiptId);

        if (match) {
            // Enrich the matched transaction
            await enrichTransactionFromReceipt(
                match.transaction_id,
                match.receipt_id,
                match.receipt_merchant_name,
                match.receipt_items,
                match.confidence
            );

            logger.info('[Email Webhook] Receipt matched and enriched:', {
                receiptId,
                transactionId: match.transaction_id,
                merchant: match.receipt_merchant_name,
                processingTime: Date.now() - startTime
            });

            return NextResponse.json({
                status: 'matched',
                receipt_id: receiptId,
                transaction_id: match.transaction_id,
                merchant: match.receipt_merchant_name
            });
        }

        // No match found - receipt stored for future matching
        logger.info('[Email Webhook] Receipt stored (no match yet):', {
            receiptId,
            merchant: parsed.merchant_name,
            amount: parsed.amount,
            processingTime: Date.now() - startTime
        });

        return NextResponse.json({
            status: 'stored',
            receipt_id: receiptId,
            merchant: parsed.merchant_name,
            message: 'Receipt stored, will match when transaction is uploaded'
        });

    } catch (error) {
        logger.error('[Email Webhook] Error:', error instanceof Error ? error.message : error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/email/receive
 * Health check endpoint for testing webhook availability.
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        service: 'email-receipt-webhook',
        timestamp: new Date().toISOString()
    });
}
