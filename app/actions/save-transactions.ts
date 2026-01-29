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
            // Check if this is a bank withdrawal (transfer type from OCR)
            const extendedT = t as unknown as {
                p2p_counterparty?: string;
                p2p_memo?: string;
                is_bank_withdrawal?: boolean;
            };
            const isBankWithdrawal = extendedT.is_bank_withdrawal === true || t.type === 'transfer';

            // Determine P2P direction from transaction data
            let p2pDirection: string | null = null;
            if (isScreenshot) {
                if (isBankWithdrawal) {
                    p2pDirection = 'withdrawal';
                } else if (t.type === 'income') {
                    p2pDirection = 'received';
                } else {
                    p2pDirection = 'sent';
                }
            }

            // Determine reconciliation status
            // - Bank withdrawals need matching to bank statement deposits
            // - Screenshot transactions start as 'pending' (need matching to CC)
            // - Non-screenshot transactions with P2P keywords start as 'pending'
            // - Other transactions are 'standalone'
            const isP2PKeyword = /bit|paybox|ביט|פייבוקס/i.test(t.merchant_raw || '');
            const reconciliationStatus = isScreenshot || isP2PKeyword ? 'pending' : 'standalone';

            // Bank withdrawals are stored as 'expense' type but will be matched and eliminated
            const transactionType = isBankWithdrawal ? 'expense' : t.type;

            // Preserve category from parsed data (for pre-tagged CSV imports)
            const hasCategory = t.category && t.category.trim().length > 0;

            return {
                household_id: householdId,
                date: t.date,
                merchant_raw: t.merchant_raw,
                merchant_normalized: t.merchant_normalized || null,
                amount: t.amount,
                currency: t.currency || 'ILS',
                type: transactionType,
                category: hasCategory ? t.category : null,
                is_reimbursement: t.is_reimbursement || false,
                is_installment: t.is_installment || false,
                installment_info: t.installment_info || null,
                source: isScreenshot ? 'BIT/Paybox Screenshot' : 'upload',
                status: hasCategory ? 'categorized' : 'pending',
                // Foreign currency support (for Israeli CC statements with FX transactions)
                original_amount: t.original_amount || null,
                original_currency: t.original_currency || null,
                // P2P Reconciliation fields
                reconciliation_status: reconciliationStatus,
                p2p_counterparty: extendedT.p2p_counterparty || null,
                p2p_memo: extendedT.p2p_memo || null,
                p2p_direction: p2pDirection
            };
        });

        const { data: insertedData, error } = await supabase
            .from('transactions')
            .insert(dbTransactions)
            .select('id, date, amount, currency, merchant_raw, original_amount, original_currency');

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
                        merchant_raw: t.merchant_raw ?? undefined,
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
