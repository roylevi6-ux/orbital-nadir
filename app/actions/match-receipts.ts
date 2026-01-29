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

// Known service mappings: receipt merchant name patterns → CC transaction patterns
// These services commonly appear with different names due to PayPal or payment processors
const KNOWN_SERVICE_MAPPINGS: Array<{ receipt: RegExp; transaction: RegExp }> = [
    // Streaming & Digital Services
    { receipt: /spotify/i, transaction: /paypal.*spotify|spotify/i },
    { receipt: /netflix/i, transaction: /paypal.*netflix|netflix/i },
    { receipt: /google\s*(play|payment|one)?/i, transaction: /paypal.*google|google/i },
    { receipt: /apple/i, transaction: /apple|itunes/i },
    { receipt: /amazon/i, transaction: /paypal.*amazon|amazon|amzn/i },
    { receipt: /dropbox/i, transaction: /paypal.*dropbox|dropbox/i },
    { receipt: /adobe/i, transaction: /paypal.*adobe|adobe/i },
    { receipt: /microsoft|office\s*365/i, transaction: /paypal.*microsoft|microsoft|msft/i },
    // Cloud & Dev Services
    { receipt: /anthropic/i, transaction: /paypal.*anthropic|anthropic/i },
    { receipt: /openai/i, transaction: /paypal.*openai|openai/i },
    { receipt: /cloudflare/i, transaction: /paypal.*cloudflare|cloudflare/i },
    { receipt: /github/i, transaction: /paypal.*github|github/i },
    { receipt: /vercel/i, transaction: /paypal.*vercel|vercel/i },
    { receipt: /heroku/i, transaction: /paypal.*heroku|heroku/i },
    { receipt: /digital\s*ocean/i, transaction: /paypal.*digital|digitalocean/i },
    // Israeli Services
    { receipt: /bezeq|בזק/i, transaction: /bezeq|בזק/i },
    { receipt: /cellcom|סלקום/i, transaction: /cellcom|סלקום/i },
    { receipt: /partner|פרטנר/i, transaction: /partner|פרטנר/i },
    { receipt: /hot|הוט/i, transaction: /hot|הוט/i },
    { receipt: /yes|יס/i, transaction: /yes|יס/i },
    // Israeli Utilities
    { receipt: /electra\s*power|superpower|אלקטרה\s*פאוור/i, transaction: /electra|superpower|אלקטרה\s*פאוור/i },
    { receipt: /הארץ|haaretz/i, transaction: /הארץ|הוצאת\s*עיתון|haaretz/i },
    { receipt: /מוסדות\s*חינוך/i, transaction: /מוסדות\s*חינוך/i },
    // E-commerce
    { receipt: /aliexpress/i, transaction: /paypal.*ali|aliexpress|alibaba/i },
    { receipt: /ebay/i, transaction: /paypal.*ebay|ebay/i },
    { receipt: /temu/i, transaction: /paypal.*temu|temu/i },
    { receipt: /shein/i, transaction: /paypal.*shein|shein/i },
    // VPN & Security
    { receipt: /nord\s*(vpn|account)?/i, transaction: /paypal.*nord|nordvpn/i },
    { receipt: /express\s*vpn/i, transaction: /paypal.*express|expressvpn/i },
];

/**
 * Check if merchant names indicate the same service.
 * Uses known mappings for services that appear differently on receipts vs CC statements.
 */
function merchantsMatch(receiptMerchant: string, txMerchant: string): boolean {
    if (!receiptMerchant || !txMerchant) return false;

    const receiptLower = receiptMerchant.toLowerCase();
    const txLower = txMerchant.toLowerCase();

    // Direct substring match (case-insensitive)
    if (receiptLower.includes(txLower) || txLower.includes(receiptLower)) {
        return true;
    }

    // Check known service mappings
    for (const mapping of KNOWN_SERVICE_MAPPINGS) {
        if (mapping.receipt.test(receiptMerchant) && mapping.transaction.test(txMerchant)) {
            return true;
        }
    }

    // Extract significant words (3+ chars) and check overlap
    const extractWords = (s: string) =>
        s.toLowerCase()
         .replace(/[^\w\u0590-\u05FF]/g, ' ')  // Keep Hebrew and ASCII alphanumeric
         .split(/\s+/)
         .filter(w => w.length >= 3);

    const receiptWords = new Set(extractWords(receiptMerchant));
    const txWords = extractWords(txMerchant);

    // If any significant word matches, consider it a match
    for (const word of txWords) {
        if (receiptWords.has(word)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if amounts match considering possible currency conversion.
 * Now also considers merchant matching to determine tolerance level.
 *
 * @param merchantMatch - Whether merchants were identified as matching
 * @returns Match result with tolerance applied based on merchant match
 */
function amountsMatch(
    receiptAmount: number,
    receiptCurrency: string,
    txAmount: number,
    txCurrency: string,
    txOriginalAmount?: number,
    txOriginalCurrency?: string,
    merchantMatch: boolean = false
): { matches: boolean; isCrossCurrency: boolean; isExactFxMatch: boolean } {
    // Priority 1: Check original currency match (best for Israeli CC FX transactions)
    // Example: Receipt €5.64, Transaction original_amount=5.64, original_currency=EUR
    if (txOriginalCurrency && txOriginalAmount && receiptCurrency === txOriginalCurrency) {
        const exactMatch = Math.abs(receiptAmount - txOriginalAmount) < 0.02;
        if (exactMatch) {
            return { matches: true, isCrossCurrency: false, isExactFxMatch: true };
        }
    }

    // Priority 2: Same currency match
    // Tolerance depends on merchant match:
    // - With merchant match: 3% (allows PayPal fees, VAT)
    // - Without merchant match: 0.5% (strict - avoid false positives)
    if (receiptCurrency === txCurrency) {
        const maxAmount = Math.max(receiptAmount, txAmount);
        const tolerancePercent = merchantMatch ? 0.03 : 0.005; // 3% vs 0.5%
        const tolerance = maxAmount * tolerancePercent;
        return {
            matches: Math.abs(receiptAmount - txAmount) <= tolerance,
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
    // Need merchant_raw for merchant matching
    const txWithMerchant = transactions as Array<TransactionForMatching & { merchant_raw?: string }>;

    for (const tx of txWithMerchant) {
        const txDate = new Date(tx.date);

        // Find receipts that match: merchant + amount (with tolerance based on merchant match), date within ±2 days
        const candidates = receipts.filter(r => {
            if (!r.amount || !r.receipt_date) return false;

            // Check merchant match first (determines amount tolerance)
            const isMerchantMatch = merchantsMatch(r.merchant_name || '', tx.merchant_raw || '');

            // Check amount match (tolerance depends on merchant match)
            const { matches } = amountsMatch(
                r.amount,
                r.currency,
                tx.amount,
                tx.currency,
                tx.original_amount,
                tx.original_currency,
                isMerchantMatch
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
    // Include merchant_raw for merchant matching and original_amount/original_currency for FX
    const { data: transactions, error: txError } = await adminClient
        .from('transactions')
        .select('id, date, amount, currency, merchant_raw, original_amount, original_currency')
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

    // Find matching transaction
    // Priority: exact FX match > merchant match with amount > amount-only match
    let bestMatch: typeof transactions[0] | null = null;
    let bestMatchScore = 0; // Higher = better match

    for (const tx of transactions) {
        const isMerchantMatch = merchantsMatch(receipt.merchant_name || '', tx.merchant_raw || '');
        const { matches, isCrossCurrency, isExactFxMatch } = amountsMatch(
            receipt.amount!,
            receipt.currency,
            tx.amount,
            tx.currency,
            tx.original_amount ?? undefined,
            tx.original_currency ?? undefined,
            isMerchantMatch
        );

        if (matches) {
            // Score: exact FX (100) > merchant match (80) > cross-currency (60) > amount-only (40)
            let score = 40;
            if (isExactFxMatch) score = 100;
            else if (isMerchantMatch) score = 80;
            else if (isCrossCurrency) score = 60;

            if (score > bestMatchScore) {
                bestMatchScore = score;
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
