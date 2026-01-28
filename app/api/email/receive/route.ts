import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth/server';
import { parseReceiptEmail } from '@/app/actions/parse-receipt-email';
import { storeReceipt } from '@/app/actions/store-receipt';
import { matchReceiptToTransaction } from '@/app/actions/match-receipts';
import { enrichTransactionFromReceipt } from '@/app/actions/enrich-transaction';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

/**
 * Verify Resend webhook signature.
 * See: https://resend.com/docs/webhooks#webhook-signatures
 */
function verifySignature(payload: string, signature: string): boolean {
    if (!WEBHOOK_SECRET) {
        logger.warn('[Email Webhook] No RESEND_WEBHOOK_SECRET configured, skipping verification');
        return true; // Allow in development
    }

    try {
        const expected = crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    } catch {
        return false;
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
        const signature = request.headers.get('x-resend-signature') || '';
        const rawBody = await request.text();

        let from: string;
        let to: string;
        let subject: string;
        let emailContent: string;

        if (isCloudflare) {
            // Cloudflare Email Worker format
            const payload = JSON.parse(rawBody);
            from = payload.from || '';
            to = payload.to || '';
            subject = payload.subject || '';

            // Parse raw email to extract body
            const rawEmail = payload.rawEmail || '';
            // Extract text content from raw email (simplified parsing)
            // The raw email contains headers and body separated by double newline
            const bodyStart = rawEmail.indexOf('\r\n\r\n');
            emailContent = bodyStart > -1 ? rawEmail.substring(bodyStart + 4) : rawEmail;

            logger.debug('[Email Webhook] Cloudflare email received:', { from, to, subject: subject?.substring(0, 50) });
        } else {
            // Resend webhook format
            // Verify webhook authenticity
            if (WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
                logger.warn('[Email Webhook] Invalid signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }

            const payload = JSON.parse(rawBody);
            const { type, data } = payload;

            // Only handle inbound emails
            if (type !== 'email.received') {
                logger.debug('[Email Webhook] Ignoring event type:', type);
                return NextResponse.json({ status: 'ignored', reason: 'not_inbound_email' });
            }

            from = data.from || '';
            to = data.to || '';
            subject = data.subject || '';
            emailContent = data.html || data.text || '';

            logger.debug('[Email Webhook] Resend email received:', { from, to, subject: subject?.substring(0, 50) });
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

        // Parse the email content with AI
        const parsed = await parseReceiptEmail(emailContent, subject);

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
