import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth/server';
import { parseSmsReceipt } from '@/app/actions/parse-sms-receipt';
import { storeSmsTransactionAdmin, isDuplicateSmsAdmin } from '@/app/actions/sms-deduplication';
import { detectSpenderFromSmsAdmin } from '@/app/actions/spender-detection';
import { logger } from '@/lib/logger';

// Simple token-based auth for iOS Shortcuts
// Users get their token from Settings page
const validateToken = async (token: string): Promise<{ valid: boolean; householdId?: string }> => {
    if (!token) return { valid: false };

    const adminClient = createAdminClient();

    // Look up household by receipt_token
    const { data, error } = await adminClient
        .from('households')
        .select('id')
        .eq('receipt_token', token)
        .single();

    if (error || !data) {
        logger.warn('[SMS Ingest] Invalid token:', token.substring(0, 8) + '...');
        return { valid: false };
    }

    return { valid: true, householdId: data.id };
};

/**
 * POST /api/sms/ingest
 *
 * Direct SMS ingestion endpoint for iOS Shortcuts.
 * Works reliably when phone is locked (unlike email-based approach).
 *
 * Request body:
 * {
 *   "token": "household_receipt_token",
 *   "message": "שלום, בכרטיסך 8770 אושרה עסקה ב-29/01 בסך 143.42 ש"ח במנורה מבטחים"
 * }
 *
 * iOS Shortcut Setup:
 * 1. Automation: When I receive SMS containing "אושרה עסקה"
 * 2. Action: Get Contents of URL
 *    - URL: https://your-app.vercel.app/api/sms/ingest
 *    - Method: POST
 *    - Headers: Content-Type: application/json
 *    - Body: {"token": "YOUR_TOKEN", "message": "Shortcut Input"}
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const { token, message } = body;

        // Validate required fields
        if (!token || !message) {
            return NextResponse.json(
                { success: false, error: 'Missing token or message' },
                { status: 400 }
            );
        }

        // Validate token and get household
        const auth = await validateToken(token);
        if (!auth.valid || !auth.householdId) {
            return NextResponse.json(
                { success: false, error: 'Invalid token' },
                { status: 401 }
            );
        }

        const householdId = auth.householdId;
        logger.info('[SMS Ingest] Processing SMS for household:', householdId.substring(0, 8) + '...');

        // Parse the SMS (async function)
        const parsed = await parseSmsReceipt(message);

        if (!parsed.is_valid) {
            logger.warn('[SMS Ingest] Could not parse SMS:', message.substring(0, 50));
            return NextResponse.json({
                success: false,
                error: 'Could not parse SMS format',
                raw: message.substring(0, 100)
            }, { status: 400 });
        }

        // Check for duplicates (pass the parsed object directly)
        const isDupe = await isDuplicateSmsAdmin(householdId, parsed);

        if (isDupe) {
            logger.info('[SMS Ingest] Duplicate SMS, skipping');
            return NextResponse.json({
                success: true,
                status: 'duplicate',
                message: 'SMS already processed'
            });
        }

        // Detect spender from card ending
        let spender: 'R' | 'N' | null = null;
        if (parsed.card_ending) {
            const spenderResult = await detectSpenderFromSmsAdmin(householdId, parsed.card_ending);
            if (spenderResult.detected && spenderResult.spender) {
                spender = spenderResult.spender;
            }
        }

        // Store the SMS transaction (pass ParsedSmsReceipt directly)
        const result = await storeSmsTransactionAdmin(householdId, parsed, spender);

        const duration = Date.now() - startTime;

        if (!result.success) {
            // Could be duplicate or other error
            if (result.error === 'Duplicate SMS detected') {
                return NextResponse.json({
                    success: true,
                    status: 'duplicate',
                    message: 'SMS already processed'
                });
            }
            logger.warn('[SMS Ingest] Failed to store:', result.error);
            return NextResponse.json({
                success: false,
                error: result.error
            }, { status: 500 });
        }

        logger.info('[SMS Ingest] Success:', {
            merchant: parsed.merchant_name,
            amount: parsed.amount,
            spender,
            duration: `${duration}ms`
        });

        return NextResponse.json({
            success: true,
            status: 'created',
            data: {
                merchant: parsed.merchant_name,
                amount: parsed.amount,
                currency: parsed.currency,
                date: parsed.transaction_date,
                card: parsed.card_ending ? `****${parsed.card_ending}` : null,
                spender,
                transaction_id: result.data.transactionId
            }
        });

    } catch (error) {
        logger.error('[SMS Ingest] Error:', error instanceof Error ? error.message : error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/sms/ingest
 * Health check / token validation endpoint
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
        return NextResponse.json({
            status: 'ok',
            service: 'sms-ingest',
            usage: 'POST with {token, message} to ingest SMS'
        });
    }

    // Validate token
    const auth = await validateToken(token);
    return NextResponse.json({
        status: 'ok',
        token_valid: auth.valid,
        service: 'sms-ingest'
    });
}
