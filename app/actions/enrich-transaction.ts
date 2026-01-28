'use server';

import { createAdminClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';
import { ReceiptItem } from '@/lib/types/receipt';
import { linkReceiptToTransaction } from './match-receipts';

/**
 * Enrich a transaction with data from a matched receipt.
 * Updates merchant_normalized and notes fields.
 *
 * @param transactionId - Transaction to enrich
 * @param receiptId - Matched receipt
 * @param receiptMerchantName - Clean merchant name from receipt
 * @param receiptItems - Items from receipt
 * @param confidence - Match confidence score
 */
export async function enrichTransactionFromReceipt(
    transactionId: string,
    receiptId: string,
    receiptMerchantName: string,
    receiptItems: ReceiptItem[],
    confidence: number
): Promise<boolean> {
    const adminClient = createAdminClient();

    // Get current transaction state
    const { data: transaction, error: fetchError } = await adminClient
        .from('transactions')
        .select('id, merchant_normalized, notes, category_confidence')
        .eq('id', transactionId)
        .single();

    if (fetchError || !transaction) {
        logger.error('[Enrich Transaction] Failed to fetch transaction:', transactionId);
        return false;
    }

    // Build the enrichment data
    const updates: Record<string, unknown> = {
        receipt_id: receiptId
    };

    // Update merchant_normalized if receipt has better info
    if (receiptMerchantName && !transaction.merchant_normalized) {
        updates.merchant_normalized = receiptMerchantName;
    }

    // Build notes string with receipt info
    const itemsList = receiptItems.map(item => {
        if (item.quantity && item.quantity > 1) {
            return `${item.name} x${item.quantity}`;
        }
        return item.name;
    }).join(', ');

    const receiptNote = itemsList
        ? `[Receipt] Merchant: ${receiptMerchantName} | Items: ${itemsList}`
        : `[Receipt] Merchant: ${receiptMerchantName}`;

    // Append to existing notes or create new
    if (transaction.notes) {
        updates.notes = `${transaction.notes}\n${receiptNote}`;
    } else {
        updates.notes = receiptNote;
    }

    // Boost confidence if already categorized
    if (transaction.category_confidence) {
        updates.category_confidence = Math.min(100, transaction.category_confidence + 10);
    }

    // Update the transaction
    const { error: updateError } = await adminClient
        .from('transactions')
        .update(updates)
        .eq('id', transactionId);

    if (updateError) {
        logger.error('[Enrich Transaction] Update error:', updateError.message);
        return false;
    }

    // Link the receipt to the transaction (updates both sides)
    await linkReceiptToTransaction(receiptId, transactionId, confidence);

    logger.debug('[Enrich Transaction] Enriched transaction:', transactionId, 'with receipt:', receiptId);
    return true;
}

/**
 * Process all receipt matches and enrich transactions.
 * Called after AI categorization.
 *
 * @param matches - Array of receipt matches to process
 * @returns Number of transactions enriched
 */
export async function enrichTransactionsFromMatches(
    matches: Array<{
        receipt_id: string;
        transaction_id: string;
        receipt_merchant_name: string;
        receipt_items: ReceiptItem[];
        confidence: number;
    }>
): Promise<number> {
    let enrichedCount = 0;

    for (const match of matches) {
        const success = await enrichTransactionFromReceipt(
            match.transaction_id,
            match.receipt_id,
            match.receipt_merchant_name,
            match.receipt_items,
            match.confidence
        );
        if (success) enrichedCount++;
    }

    logger.debug(`[Enrich Transactions] Enriched ${enrichedCount}/${matches.length} transactions`);
    return enrichedCount;
}
