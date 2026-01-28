'use server';

import { createAdminClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';
import { StoreReceiptInput } from '@/lib/types/receipt';

/**
 * Store a parsed receipt in the database.
 * Uses admin client to bypass RLS (called from webhook).
 *
 * @param input - Receipt data to store
 * @returns The ID of the created receipt, or null on error
 */
export async function storeReceipt(input: StoreReceiptInput): Promise<string | null> {
    const adminClient = createAdminClient();

    try {
        const { data, error } = await adminClient
            .from('email_receipts')
            .insert({
                household_id: input.household_id,
                sender_email: input.sender_email,
                raw_subject: input.raw_subject,
                raw_email_body: input.raw_email_body?.substring(0, 10000) || null, // Truncate to 10KB
                is_receipt: input.is_receipt,
                merchant_name: input.merchant_name,
                amount: input.amount,
                currency: input.currency,
                receipt_date: input.receipt_date,
                items: input.items,
                parse_confidence: input.confidence,
                // expires_at uses default (NOW + 12 months)
            })
            .select('id')
            .single();

        if (error) {
            logger.error('[Store Receipt] Insert error:', error.message);
            return null;
        }

        logger.debug('[Store Receipt] Created receipt:', data.id);
        return data.id;

    } catch (error) {
        logger.error('[Store Receipt] Error:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * Get a receipt by ID.
 * Uses admin client for server-side access.
 */
export async function getReceiptById(receiptId: string) {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient
        .from('email_receipts')
        .select('*')
        .eq('id', receiptId)
        .single();

    if (error) {
        logger.error('[Get Receipt] Error:', error.message);
        return null;
    }

    return data;
}

/**
 * Get unmatched receipts for a household within date range.
 * Used for matching with newly uploaded transactions.
 */
export async function getUnmatchedReceipts(
    householdId: string,
    startDate: string,
    endDate: string
) {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient
        .from('email_receipts')
        .select('id, merchant_name, amount, currency, receipt_date, items')
        .eq('household_id', householdId)
        .is('matched_transaction_id', null)
        .eq('is_receipt', true)
        .gte('receipt_date', startDate)
        .lte('receipt_date', endDate);

    if (error) {
        logger.error('[Get Unmatched Receipts] Error:', error.message);
        return [];
    }

    return data || [];
}
