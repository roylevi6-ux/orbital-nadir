'use server';

import { createAdminClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';
import { ReceiptMatch, TransactionForMatching, ReceiptItem } from '@/lib/types/receipt';

// Approximate exchange rates for cross-currency matching (ILS as base)
// These are used to allow matching when receipt is in foreign currency but CC statement is in ILS
const EXCHANGE_RATES_TO_ILS: Record<string, { min: number; max: number }> = {
    USD: { min: 3.4, max: 4.0 },   // Allow some variance for rate fluctuation
    EUR: { min: 3.6, max: 4.3 },
    GBP: { min: 4.2, max: 5.0 },
};

/**
 * Check if amounts match considering possible currency conversion.
 * Priority:
 * 1. Exact match using transaction's original_currency/original_amount (best - Israeli CC FX)
 * 2. Same currency exact match
 * 3. Cross-currency with exchange rate estimation
 */
function amountsMatch(
    receiptAmount: number,
    receiptCurrency: string,
    txAmount: number,
    txCurrency: string,
    txOriginalAmount?: number,
    txOriginalCurrency?: string
): { matches: boolean; isCrossCurrency: boolean; isExactFxMatch: boolean } {
    // Priority 1: Check original currency match (best for Israeli CC FX transactions)
    // Example: Receipt €5.64, Transaction original_amount=5.64, original_currency=EUR
    if (txOriginalCurrency && txOriginalAmount && receiptCurrency === txOriginalCurrency) {
        const exactMatch = Math.abs(receiptAmount - txOriginalAmount) < 0.02;
        if (exactMatch) {
            return { matches: true, isCrossCurrency: false, isExactFxMatch: true };
        }
    }

    // Priority 2: Same currency - exact match
    if (receiptCurrency === txCurrency) {
        return {
            matches: Math.abs(receiptAmount - txAmount) < 0.02,
            isCrossCurrency: false,
            isExactFxMatch: false
        };
    }

    // Priority 3: Cross-currency with exchange rate estimation
    // Receipt in foreign currency, transaction in ILS (no original_currency data)
    if (txCurrency === 'ILS' && EXCHANGE_RATES_TO_ILS[receiptCurrency]) {
        const rates = EXCHANGE_RATES_TO_ILS[receiptCurrency];
        const expectedMin = receiptAmount * rates.min;
        const expectedMax = receiptAmount * rates.max;

        // Transaction amount should be within expected ILS range
        if (txAmount >= expectedMin && txAmount <= expectedMax) {
            return { matches: true, isCrossCurrency: true, isExactFxMatch: false };
        }
    }

    return { matches: false, isCrossCurrency: false, isExactFxMatch: false };
}

/**
 * Match transactions to stored receipts based on date and amount.
 * This is called during AI categorization to enrich transactions with receipt data.
 *
 * @param householdId - Household to search receipts in
 * @param transactions - Transactions to find matches for
 * @returns Array of matches with receipt merchant names
 */
export async function matchTransactionsToReceipts(
    householdId: string,
    transactions: TransactionForMatching[]
): Promise<ReceiptMatch[]> {
    if (transactions.length === 0) return [];

    const adminClient = createAdminClient();
    const matches: ReceiptMatch[] = [];

    // Calculate date range: earliest tx date - 2 days to latest + 2 days
    const dates = transactions.map(t => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    minDate.setDate(minDate.getDate() - 3); // Add buffer for date matching
    maxDate.setDate(maxDate.getDate() + 3);

    const startDate = minDate.toISOString().split('T')[0];
    const endDate = maxDate.toISOString().split('T')[0];

    // Fetch all unmatched receipts in the date range (no currency filter - we handle cross-currency)
    const { data: receipts, error } = await adminClient
        .from('email_receipts')
        .select('id, merchant_name, amount, currency, receipt_date, items')
        .eq('household_id', householdId)
        .is('matched_transaction_id', null)
        .eq('is_receipt', true)
        .gte('receipt_date', startDate)
        .lte('receipt_date', endDate);

    if (error) {
        logger.error('[Match Receipts] Query error:', error.message);
        return [];
    }

    if (!receipts || receipts.length === 0) {
        logger.debug('[Match Receipts] No unmatched receipts in date range');
        return [];
    }

    logger.debug(`[Match Receipts] Found ${receipts.length} unmatched receipts to check`);

    // For each transaction, find matching receipt
    for (const tx of transactions) {
        const txDate = new Date(tx.date);

        // Find receipts that match: amount (same or converted), date within ±2 days
        const candidates = receipts.filter(r => {
            if (!r.amount || !r.receipt_date) return false;

            // Check amount match (including cross-currency conversion and original FX)
            const { matches } = amountsMatch(
                r.amount,
                r.currency,
                tx.amount,
                tx.currency,
                tx.original_amount,
                tx.original_currency
            );
            if (!matches) return false;

            // Date within ±2 days
            const receiptDate = new Date(r.receipt_date);
            const daysDiff = Math.abs(
                (txDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            return daysDiff <= 2;
        });

        if (candidates.length === 0) continue;

        // Pick best match (prefer same day, then closest date)
        let bestMatch = candidates[0];
        let bestScore = 0;

        for (const candidate of candidates) {
            const receiptDate = new Date(candidate.receipt_date!);
            const daysDiff = Math.abs(
                (txDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            // Score: same day = 100, 1 day = 90, 2 days = 80
            const score = 100 - (daysDiff * 10);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = candidate;
            }
        }

        if (bestMatch && bestMatch.merchant_name) {
            matches.push({
                receipt_id: bestMatch.id,
                transaction_id: tx.id,
                receipt_merchant_name: bestMatch.merchant_name,
                receipt_items: (bestMatch.items as ReceiptItem[]) || [],
                confidence: bestScore,
                reason: bestScore >= 95 ? 'exact_date_match' : 'date_proximity_match'
            });

            // Remove matched receipt from pool to prevent double-matching
            const idx = receipts.findIndex(r => r.id === bestMatch.id);
            if (idx >= 0) receipts.splice(idx, 1);
        }
    }

    logger.debug(`[Match Receipts] Found ${matches.length} matches for ${transactions.length} transactions`);
    return matches;
}

/**
 * Match a single newly-stored receipt to existing transactions.
 * Called when a new receipt email arrives.
 *
 * @param receiptId - ID of the receipt to match
 * @returns The match result if found, or null
 */
export async function matchReceiptToTransaction(receiptId: string): Promise<ReceiptMatch | null> {
    const adminClient = createAdminClient();

    // Get the receipt
    const { data: receipt, error: receiptError } = await adminClient
        .from('email_receipts')
        .select('id, household_id, merchant_name, amount, currency, receipt_date, items')
        .eq('id', receiptId)
        .single();

    if (receiptError || !receipt) {
        logger.error('[Match Receipt] Receipt not found:', receiptId);
        return null;
    }

    if (!receipt.amount || !receipt.receipt_date) {
        logger.debug('[Match Receipt] Receipt missing amount or date, skipping');
        return null;
    }

    // Calculate date range (±2 days)
    const receiptDate = new Date(receipt.receipt_date);
    const startDate = new Date(receiptDate);
    startDate.setDate(startDate.getDate() - 2);
    const endDate = new Date(receiptDate);
    endDate.setDate(endDate.getDate() + 2);

    // Find matching transactions (no currency filter - we handle cross-currency matching)
    // Include original_amount/original_currency for exact FX matching
    const { data: transactions, error: txError } = await adminClient
        .from('transactions')
        .select('id, date, amount, currency, original_amount, original_currency')
        .eq('household_id', receipt.household_id)
        .is('receipt_id', null) // Not already matched
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

    if (txError) {
        logger.error('[Match Receipt] Transaction query error:', txError.message);
        return null;
    }

    if (!transactions || transactions.length === 0) {
        logger.debug('[Match Receipt] No matching transactions found for receipt:', receiptId);
        return null;
    }

    // Find matching transaction (exact amount or cross-currency conversion)
    // Priority: exact FX match > same currency > cross-currency estimation
    let bestMatch: typeof transactions[0] | null = null;
    let isExactFx = false;

    for (const tx of transactions) {
        const { matches, isCrossCurrency, isExactFxMatch } = amountsMatch(
            receipt.amount!,
            receipt.currency,
            tx.amount,
            tx.currency,
            tx.original_amount ?? undefined,
            tx.original_currency ?? undefined
        );
        if (matches) {
            // Prefer exact FX match (original_currency matches receipt currency)
            if (isExactFxMatch) {
                bestMatch = tx;
                isExactFx = true;
                break; // Best possible match
            }
            // Prefer same-currency matches over cross-currency estimation
            if (!isCrossCurrency && !isExactFx) {
                bestMatch = tx;
            } else if (!bestMatch) {
                bestMatch = tx;
            }
        }
    }

    const exactMatch = bestMatch;

    if (!exactMatch) {
        logger.debug('[Match Receipt] No exact amount match found');
        return null;
    }

    // Calculate confidence based on date proximity
    const txDate = new Date(exactMatch.date);
    const daysDiff = Math.abs(
        (txDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const confidence = 100 - (daysDiff * 5);

    const match: ReceiptMatch = {
        receipt_id: receiptId,
        transaction_id: exactMatch.id,
        receipt_merchant_name: receipt.merchant_name || '',
        receipt_items: (receipt.items as ReceiptItem[]) || [],
        confidence,
        reason: daysDiff === 0 ? 'exact_date_match' : 'date_proximity_match'
    };

    logger.debug('[Match Receipt] Found match:', {
        receiptId,
        transactionId: exactMatch.id,
        confidence
    });

    return match;
}

/**
 * Update both sides of a receipt-transaction match.
 * Links the receipt to the transaction and vice versa.
 */
export async function linkReceiptToTransaction(
    receiptId: string,
    transactionId: string,
    confidence: number
): Promise<boolean> {
    const adminClient = createAdminClient();

    // Update transaction with receipt_id
    const { error: txError } = await adminClient
        .from('transactions')
        .update({ receipt_id: receiptId })
        .eq('id', transactionId);

    if (txError) {
        logger.error('[Link Receipt] Transaction update error:', txError.message);
        return false;
    }

    // Update receipt with match info
    const { error: receiptError } = await adminClient
        .from('email_receipts')
        .update({
            matched_transaction_id: transactionId,
            match_confidence: confidence,
            matched_at: new Date().toISOString()
        })
        .eq('id', receiptId);

    if (receiptError) {
        logger.error('[Link Receipt] Receipt update error:', receiptError.message);
        return false;
    }

    logger.debug('[Link Receipt] Successfully linked receipt', receiptId, 'to transaction', transactionId);
    return true;
}
