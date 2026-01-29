'use server';

import { withAuthAutoProvision, ActionResult } from '@/lib/auth/context';
import { ParsedTransaction } from '@/lib/parsing/types';
import { matchTransactionsToReceipts } from './match-receipts';
import { enrichTransactionsFromMatches } from './enrich-transaction';
import { logger } from '@/lib/logger';

export async function saveTransactions(
    transactions: ParsedTransaction[],
    sourceType?: string
): Promise<ActionResult<{ count: number; receiptMatches?: number }>> {
    return withAuthAutoProvision(async ({ supabase, householdId }) => {
        const isScreenshot = sourceType === 'screenshot';

        // Transform to DB format
        const dbTransactions = transactions.map(t => {
            // Determine P2P direction from transaction data
            const p2pDirection = isScreenshot
                ? (t.type === 'income' ? 'received' : 'sent')
                : null;

            // Determine reconciliation status
            // - Screenshot transactions start as 'pending' (need matching to CC)
            // - Non-screenshot transactions with P2P keywords start as 'pending'
            // - Other transactions are 'standalone'
            const isP2PKeyword = /bit|paybox|ביט|פייבוקס/i.test(t.merchant_raw || '');
            const reconciliationStatus = isScreenshot || isP2PKeyword ? 'pending' : 'standalone';

            return {
                household_id: householdId,
                date: t.date,
                merchant_raw: t.merchant_raw,
                merchant_normalized: t.merchant_normalized || null,
                amount: t.amount,
                currency: t.currency || 'ILS',
                type: t.type,
                is_reimbursement: t.is_reimbursement || false,
                is_installment: t.is_installment || false,
                installment_info: t.installment_info || null,
                source: isScreenshot ? 'BIT/Paybox Screenshot' : 'upload',
                status: 'pending',
                // Foreign currency support (for Israeli CC statements with FX transactions)
                original_amount: t.original_amount || null,
                original_currency: t.original_currency || null,
                // P2P Reconciliation fields
                reconciliation_status: reconciliationStatus,
                p2p_counterparty: (t as unknown as { p2p_counterparty?: string }).p2p_counterparty || null,
                p2p_memo: (t as unknown as { p2p_memo?: string }).p2p_memo || null,
                p2p_direction: p2pDirection
            };
        });

        const { data: insertedData, error } = await supabase
            .from('transactions')
            .insert(dbTransactions)
            .select('id, date, amount, currency, original_amount, original_currency');

        if (error) {
            throw new Error('Failed to save transactions: ' + error.message);
        }

        const insertedCount = insertedData?.length || dbTransactions.length;

        // ============================================
        // RECEIPT MATCHING: Match newly uploaded transactions to stored receipts
        // This enriches transactions with receipt merchant names before AI categorization
        // ============================================
        let receiptMatchCount = 0;
        if (insertedData && insertedData.length > 0) {
            try {
                const matches = await matchTransactionsToReceipts(
                    householdId,
                    insertedData.map(t => ({
                        id: t.id,
                        amount: t.amount,
                        currency: t.currency,
                        date: t.date,
                        original_amount: t.original_amount ?? undefined,
                        original_currency: t.original_currency ?? undefined
                    }))
                );

                if (matches.length > 0) {
                    // Enrich matched transactions with receipt data
                    receiptMatchCount = await enrichTransactionsFromMatches(matches);
                    logger.info(`[Save Transactions] Matched ${receiptMatchCount} transactions with receipts`);
                }
            } catch (err) {
                // Don't fail the upload if receipt matching fails
                logger.warn('[Save Transactions] Receipt matching failed:', err);
            }
        }

        return { count: insertedCount, receiptMatches: receiptMatchCount };
    });
}
