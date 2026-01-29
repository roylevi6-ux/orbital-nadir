'use server';

import { createClient } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface TransactionSummary {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string;
    amount: number;
    currency: string;
    type: 'expense' | 'income';
    source: string;
    category?: string;
    p2p_counterparty?: string;
    p2p_memo?: string;
    p2p_direction?: 'sent' | 'received' | 'withdrawal';
    reconciliation_status?: string;
}

export interface ReconciliationMatch {
    ccTransaction: TransactionSummary;
    appCandidates: TransactionSummary[];
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'ambiguous' | 'no_match';
    reason: string;
}

export interface WithdrawalMatch {
    appWithdrawal: TransactionSummary;        // BIT withdrawal (money leaving app)
    bankCandidates: TransactionSummary[];     // Bank statement deposits
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'ambiguous' | 'no_match';
    reason: string;
}

export interface ReconciliationResult {
    matches: ReconciliationMatch[];           // Phase 1: CC↔App matches needing review
    withdrawals: WithdrawalMatch[];           // Phase 2: BIT→Bank withdrawal matches
    balancePaid: TransactionSummary[];        // Phase 3: App-only expenses (no CC match)
    reimbursements: TransactionSummary[];     // Phase 4: Incoming P2P
    summary: {
        totalCCWithP2P: number;
        matchedCount: number;
        needsReviewCount: number;
        withdrawalCount: number;
        balancePaidCount: number;
        reimbursementCount: number;
    };
}

export interface ReconciliationOptions {
    dateRangeStart?: string;
    dateRangeEnd?: string;
    includeAlreadyReconciled?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

// Keywords to identify P2P transactions in CC statements
const P2P_KEYWORDS = ['BIT', 'ביט', 'PAYBOX', 'פייבוקס', 'PEPPER', 'PAY PAL', 'PAYPAL', 'P.P', 'P.P.'];

// Amount tolerance in ILS
const AMOUNT_TOLERANCE = 1;

// Date window: App date <= CC date <= App date + MAX_DAYS_AFTER_APP
const MAX_DAYS_AFTER_APP = 5;
const MAX_DAYS_BEFORE_APP = 1; // CC can appear 1 day before app in rare cases

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a merchant name indicates a P2P transaction
 */
function isP2PTransaction(merchantRaw: string): boolean {
    const upper = (merchantRaw || '').toUpperCase();
    return P2P_KEYWORDS.some(keyword => upper.includes(keyword.toUpperCase()));
}

/**
 * Check if transaction is from a screenshot/app source
 * All screenshots are BIT/Paybox transactions (hardcoded assumption)
 */
function isAppSource(source: string): boolean {
    const lower = (source || '').toLowerCase();
    // Screenshots are always BIT/Paybox P2P transactions
    return lower.includes('screenshot') || lower === 'bit/paybox screenshot';
}

/**
 * Calculate days difference between two dates
 */
function daysDiff(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate confidence score for a match
 */
function calculateConfidence(
    ccTx: TransactionSummary,
    appTx: TransactionSummary
): { confidence: number; reason: string } {
    const amountDiff = Math.abs(ccTx.amount - appTx.amount);
    const dateDiff = daysDiff(appTx.date, ccTx.date); // CC date - App date

    let confidence = 70; // Base confidence
    const reasons: string[] = [];

    // Amount matching
    if (amountDiff === 0) {
        confidence += 15;
        reasons.push('exact amount');
    } else if (amountDiff <= AMOUNT_TOLERANCE) {
        confidence += 10;
        reasons.push(`amount within ±₪${AMOUNT_TOLERANCE}`);
    }

    // Date proximity
    if (dateDiff === 0) {
        confidence += 15;
        reasons.push('same day');
    } else if (dateDiff >= 1 && dateDiff <= 2) {
        confidence += 10;
        reasons.push('1-2 days apart');
    } else if (dateDiff >= 3 && dateDiff <= MAX_DAYS_AFTER_APP) {
        confidence += 5;
        reasons.push(`${dateDiff} days apart`);
    }

    return {
        confidence: Math.min(confidence, 99),
        reason: reasons.join(', ')
    };
}

// ============================================================================
// Phase 1: Match Outgoing (CC ↔ App)
// ============================================================================

/**
 * Find App transactions that could match a CC P2P transaction
 */
function findAppCandidates(
    ccTx: TransactionSummary,
    appTransactions: TransactionSummary[]
): { candidates: TransactionSummary[]; scores: Map<string, { confidence: number; reason: string }> } {
    const candidates: TransactionSummary[] = [];
    const scores = new Map<string, { confidence: number; reason: string }>();

    for (const appTx of appTransactions) {
        // Skip if already matched
        if (appTx.reconciliation_status === 'matched') continue;

        // Skip incoming transactions for outgoing matching
        if (appTx.p2p_direction === 'received') continue;

        // Amount check with tolerance
        const amountDiff = Math.abs(ccTx.amount - appTx.amount);
        if (amountDiff > AMOUNT_TOLERANCE) continue;

        // Date check: App date <= CC date <= App date + MAX_DAYS
        const dateDiff = daysDiff(appTx.date, ccTx.date);
        if (dateDiff < -MAX_DAYS_BEFORE_APP || dateDiff > MAX_DAYS_AFTER_APP) continue;

        // This is a valid candidate
        candidates.push(appTx);
        scores.set(appTx.id, calculateConfidence(ccTx, appTx));
    }

    // Sort by confidence (highest first), then by date proximity
    candidates.sort((a, b) => {
        const scoreA = scores.get(a.id)?.confidence || 0;
        const scoreB = scores.get(b.id)?.confidence || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;

        // Tiebreaker: closer date
        const diffA = Math.abs(daysDiff(a.date, ccTx.date));
        const diffB = Math.abs(daysDiff(b.date, ccTx.date));
        return diffA - diffB;
    });

    return { candidates, scores };
}

/**
 * Phase 1: Match CC P2P transactions with App transactions
 */
function matchOutgoingTransactions(
    ccTransactions: TransactionSummary[],
    appTransactions: TransactionSummary[]
): ReconciliationMatch[] {
    const matches: ReconciliationMatch[] = [];
    const usedAppIds = new Set<string>();

    // Filter CC transactions that are P2P
    const ccP2P = ccTransactions.filter(tx => isP2PTransaction(tx.merchant_raw));

    for (const ccTx of ccP2P) {
        // Find candidates from App transactions
        const availableApp = appTransactions.filter(tx => !usedAppIds.has(tx.id));
        const { candidates, scores } = findAppCandidates(ccTx, availableApp);

        if (candidates.length === 0) {
            // No match found - CC transaction stands alone
            matches.push({
                ccTransaction: ccTx,
                appCandidates: [],
                confidence: 0,
                matchType: 'no_match',
                reason: 'No matching App transaction found'
            });
        } else if (candidates.length === 1) {
            // Single candidate - clear match
            const score = scores.get(candidates[0].id)!;
            matches.push({
                ccTransaction: ccTx,
                appCandidates: candidates,
                confidence: score.confidence,
                matchType: score.confidence >= 90 ? 'exact' : 'fuzzy',
                reason: score.reason
            });
            // Reserve this app transaction
            usedAppIds.add(candidates[0].id);
        } else {
            // Multiple candidates - ambiguous, needs user review
            const topScore = scores.get(candidates[0].id)!;
            matches.push({
                ccTransaction: ccTx,
                appCandidates: candidates,
                confidence: 70, // Lower confidence for ambiguous
                matchType: 'ambiguous',
                reason: `${candidates.length} possible matches - ${topScore.reason}`
            });
            // Don't reserve any - let user choose
        }
    }

    return matches;
}

// ============================================================================
// Phase 2: Identify Balance-Paid
// ============================================================================

/**
 * Phase 2: Find App transactions that weren't matched to any CC
 * These were paid from BIT/Paybox wallet balance
 */
function identifyBalancePaid(
    appTransactions: TransactionSummary[],
    matchedAppIds: Set<string>
): TransactionSummary[] {
    return appTransactions.filter(tx =>
        !matchedAppIds.has(tx.id) &&
        tx.p2p_direction === 'sent' &&
        tx.reconciliation_status !== 'matched' &&
        tx.reconciliation_status !== 'balance_paid'
    );
}

// ============================================================================
// Phase 3: Match Withdrawals (BIT→Bank)
// ============================================================================

// Keywords to identify BIT/Paybox deposits in bank statements
const BANK_BIT_KEYWORDS = ['BIT', 'ביט', 'PAYBOX', 'פייבוקס', 'העברה מ', 'PEPPER'];

/**
 * Check if a bank transaction looks like a BIT/Paybox deposit
 */
function isBankBitDeposit(tx: TransactionSummary): boolean {
    if (tx.type !== 'income') return false;
    const merchantUpper = (tx.merchant_raw || '').toUpperCase();
    return BANK_BIT_KEYWORDS.some(k => merchantUpper.includes(k.toUpperCase()));
}

/**
 * Phase 3: Match BIT withdrawals to bank statement deposits
 */
function matchWithdrawals(
    appWithdrawals: TransactionSummary[],
    bankTransactions: TransactionSummary[]
): WithdrawalMatch[] {
    const matches: WithdrawalMatch[] = [];
    const usedBankIds = new Set<string>();

    // Find bank transactions that look like BIT deposits
    const bankBitDeposits = bankTransactions.filter(tx => isBankBitDeposit(tx));

    for (const withdrawal of appWithdrawals) {
        const candidates: TransactionSummary[] = [];
        const scores = new Map<string, { confidence: number; reason: string }>();

        for (const bankTx of bankBitDeposits) {
            if (usedBankIds.has(bankTx.id)) continue;

            // Amount check (should match exactly or very close)
            const amountDiff = Math.abs(withdrawal.amount - bankTx.amount);
            if (amountDiff > AMOUNT_TOLERANCE) continue;

            // Date check: Bank deposit usually same day or 1-2 days after BIT withdrawal
            const dateDiff = daysDiff(withdrawal.date, bankTx.date);
            if (dateDiff < -1 || dateDiff > 3) continue;

            // Valid candidate
            candidates.push(bankTx);

            let confidence = 70;
            const reasons: string[] = [];

            if (amountDiff === 0) {
                confidence += 15;
                reasons.push('exact amount');
            }
            if (dateDiff === 0) {
                confidence += 15;
                reasons.push('same day');
            } else if (dateDiff <= 1) {
                confidence += 10;
                reasons.push('1 day apart');
            }

            scores.set(bankTx.id, { confidence, reason: reasons.join(', ') });
        }

        if (candidates.length === 0) {
            matches.push({
                appWithdrawal: withdrawal,
                bankCandidates: [],
                confidence: 0,
                matchType: 'no_match',
                reason: 'No matching bank deposit found'
            });
        } else if (candidates.length === 1) {
            const score = scores.get(candidates[0].id)!;
            matches.push({
                appWithdrawal: withdrawal,
                bankCandidates: candidates,
                confidence: score.confidence,
                matchType: score.confidence >= 90 ? 'exact' : 'fuzzy',
                reason: score.reason
            });
            usedBankIds.add(candidates[0].id);
        } else {
            const topScore = scores.get(candidates[0].id)!;
            matches.push({
                appWithdrawal: withdrawal,
                bankCandidates: candidates,
                confidence: 70,
                matchType: 'ambiguous',
                reason: `${candidates.length} possible matches`
            });
        }
    }

    return matches;
}

// ============================================================================
// Phase 4: Process Reimbursements
// ============================================================================

/**
 * Phase 4: Identify incoming P2P transactions (all are reimbursements)
 */
function identifyReimbursements(
    appTransactions: TransactionSummary[]
): TransactionSummary[] {
    return appTransactions.filter(tx =>
        tx.p2p_direction === 'received' &&
        tx.reconciliation_status !== 'reimbursement'
    );
}

// ============================================================================
// Main Reconciliation Function
// ============================================================================

/**
 * Run P2P reconciliation for current user's household
 * Returns all items that need user review (NO auto-merging)
 */
export async function runP2PReconciliation(
    options: ReconciliationOptions = {}
): Promise<ReconciliationResult> {
    const supabase = await createClient();

    // Get user's household
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return {
            matches: [],
            withdrawals: [],
            balancePaid: [],
            reimbursements: [],
            summary: { totalCCWithP2P: 0, matchedCount: 0, needsReviewCount: 0, withdrawalCount: 0, balancePaidCount: 0, reimbursementCount: 0 }
        };
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return {
            matches: [],
            withdrawals: [],
            balancePaid: [],
            reimbursements: [],
            summary: { totalCCWithP2P: 0, matchedCount: 0, needsReviewCount: 0, withdrawalCount: 0, balancePaidCount: 0, reimbursementCount: 0 }
        };
    }

    const householdId = profile.household_id;

    // Build query for transactions
    let query = supabase
        .from('transactions')
        .select(`
            id, date, merchant_raw, merchant_normalized, amount, currency,
            type, source, category, p2p_counterparty, p2p_memo, p2p_direction,
            reconciliation_status, is_duplicate, duplicate_of
        `)
        .eq('household_id', householdId)
        .order('date', { ascending: false });

    // Apply date range filters if provided
    if (options.dateRangeStart) {
        query = query.gte('date', options.dateRangeStart);
    }
    if (options.dateRangeEnd) {
        query = query.lte('date', options.dateRangeEnd);
    }

    // By default, exclude already reconciled
    if (!options.includeAlreadyReconciled) {
        query = query.or('reconciliation_status.eq.pending,reconciliation_status.is.null');
    }

    const { data: transactions, error } = await query;

    if (error) {
        logger.error('[P2P Reconciliation] Error fetching transactions:', error.message);
        throw new Error('Failed to fetch transactions for reconciliation');
    }

    if (!transactions || transactions.length === 0) {
        return {
            matches: [],
            withdrawals: [],
            balancePaid: [],
            reimbursements: [],
            summary: {
                totalCCWithP2P: 0,
                matchedCount: 0,
                needsReviewCount: 0,
                withdrawalCount: 0,
                balancePaidCount: 0,
                reimbursementCount: 0
            }
        };
    }

    // Split transactions by source type
    // For app transactions, ensure p2p_direction is set based on type if missing
    const appTransactions = transactions
        .filter(tx => isAppSource(tx.source))
        .map(tx => ({
            ...tx,
            // Default p2p_direction based on transaction type if not set
            p2p_direction: tx.p2p_direction || (tx.type === 'income' ? 'received' : 'sent')
        })) as TransactionSummary[];
    const ccTransactions = transactions.filter(tx => !isAppSource(tx.source)) as TransactionSummary[];

    // Separate withdrawals from regular app transactions
    const appWithdrawals = appTransactions.filter(tx => tx.p2p_direction === 'withdrawal');
    const appNonWithdrawals = appTransactions.filter(tx => tx.p2p_direction !== 'withdrawal');

    logger.info('[P2P Reconciliation] Processing:', {
        total: transactions.length,
        app: appTransactions.length,
        appWithdrawals: appWithdrawals.length,
        cc: ccTransactions.length
    });

    // Phase 1: Match outgoing (CC↔App) - excludes withdrawals
    const matches = matchOutgoingTransactions(ccTransactions, appNonWithdrawals);

    // Collect matched App IDs
    const matchedAppIds = new Set<string>();
    for (const match of matches) {
        if (match.matchType !== 'no_match' && match.appCandidates.length === 1) {
            matchedAppIds.add(match.appCandidates[0].id);
        }
    }

    // Phase 2: Match withdrawals (BIT→Bank)
    const withdrawals = matchWithdrawals(appWithdrawals, ccTransactions);

    // Phase 3: Identify balance-paid (sent but no CC match, excludes withdrawals)
    const balancePaid = identifyBalancePaid(appNonWithdrawals, matchedAppIds);

    // Phase 4: Identify reimbursements (received money)
    const reimbursements = identifyReimbursements(appNonWithdrawals);

    // Build summary
    const ccP2PCount = ccTransactions.filter(tx => isP2PTransaction(tx.merchant_raw)).length;
    const matchedCount = matches.filter(m => m.matchType !== 'no_match').length;
    const withdrawalMatchCount = withdrawals.filter(w => w.matchType !== 'no_match').length;

    const result: ReconciliationResult = {
        matches: matches.filter(m => m.matchType !== 'no_match'), // Only show actual matches
        withdrawals: withdrawals.filter(w => w.matchType !== 'no_match'), // Only show actual withdrawal matches
        balancePaid,
        reimbursements,
        summary: {
            totalCCWithP2P: ccP2PCount,
            matchedCount,
            needsReviewCount: matches.length,
            withdrawalCount: withdrawalMatchCount,
            balancePaidCount: balancePaid.length,
            reimbursementCount: reimbursements.length
        }
    };

    logger.info('[P2P Reconciliation] Result:', result.summary);

    return result;
}

// ============================================================================
// Merge Functions
// ============================================================================

/**
 * Merge a CC transaction with an App transaction
 * CC keeps: date, amount, currency (financial truth)
 * App provides: merchant_normalized (human-readable name), p2p_counterparty, p2p_memo
 */
export async function mergeP2PMatch(
    ccTxId: string,
    appTxId: string,
    options?: {
        category?: string;
        notes?: string;
    }
): Promise<{ success: boolean; error?: string; groupId?: string }> {
    const adminClient = createAdminClient();
    const groupId = uuidv4();

    try {
        // Get App transaction data for enrichment
        const { data: appTx, error: appError } = await adminClient
            .from('transactions')
            .select('merchant_raw, merchant_normalized, p2p_counterparty, p2p_memo, category, notes')
            .eq('id', appTxId)
            .single();

        if (appError || !appTx) {
            return { success: false, error: 'App transaction not found' };
        }

        // Prepare enriched merchant name
        const enrichedMerchant = appTx.p2p_counterparty || appTx.merchant_normalized || appTx.merchant_raw;

        // Prepare notes
        let enrichedNotes = options?.notes || '';
        if (appTx.p2p_memo) {
            enrichedNotes = enrichedNotes
                ? `${enrichedNotes} | Memo: ${appTx.p2p_memo}`
                : `Memo: ${appTx.p2p_memo}`;
        }

        // Update CC transaction (keep as primary, enrich with app data)
        const { error: ccUpdateError } = await adminClient
            .from('transactions')
            .update({
                merchant_normalized: enrichedMerchant,
                category: options?.category || appTx.category,
                notes: enrichedNotes || null,
                reconciliation_status: 'matched',
                reconciliation_group_id: groupId,
                status: 'verified'
            })
            .eq('id', ccTxId);

        if (ccUpdateError) {
            logger.error('[P2P Reconciliation] Error updating CC transaction:', ccUpdateError.message);
            return { success: false, error: 'Failed to update CC transaction' };
        }

        // Mark App transaction as matched (linked to CC)
        const { error: appUpdateError } = await adminClient
            .from('transactions')
            .update({
                reconciliation_status: 'matched',
                reconciliation_group_id: groupId,
                is_duplicate: true, // For backward compatibility
                duplicate_of: ccTxId, // For backward compatibility
                status: 'verified'
            })
            .eq('id', appTxId);

        if (appUpdateError) {
            logger.error('[P2P Reconciliation] Error updating App transaction:', appUpdateError.message);
            return { success: false, error: 'Failed to update App transaction' };
        }

        logger.info('[P2P Reconciliation] Merged:', { ccTxId, appTxId, groupId });
        return { success: true, groupId };

    } catch (error) {
        logger.error('[P2P Reconciliation] Merge error:', error);
        return { success: false, error: 'Unexpected error during merge' };
    }
}

/**
 * Mark an App transaction as balance-paid (paid from wallet, not CC)
 * Optionally set a category for the expense
 */
export async function markAsBalancePaid(
    txId: string,
    category?: string,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const adminClient = createAdminClient();

    const updateData: Record<string, unknown> = {
        reconciliation_status: 'balance_paid',
        status: 'verified'
    };

    if (category) {
        updateData.category = category;
    }

    if (notes) {
        updateData.notes = notes;
    }

    const { error } = await adminClient
        .from('transactions')
        .update(updateData)
        .eq('id', txId);

    if (error) {
        logger.error('[P2P Reconciliation] Error marking as balance_paid:', error.message);
        return { success: false, error: error.message };
    }

    return { success: true };
}

/**
 * Merge a BIT withdrawal with a bank statement deposit (eliminate both)
 * Both are internal transfers, not real income/expense
 */
export async function mergeWithdrawal(
    withdrawalId: string,
    bankDepositId: string
): Promise<{ success: boolean; error?: string; groupId?: string }> {
    const adminClient = createAdminClient();
    const groupId = uuidv4();

    try {
        // Mark BIT withdrawal as matched (internal transfer)
        const { error: withdrawalError } = await adminClient
            .from('transactions')
            .update({
                reconciliation_status: 'withdrawal_matched',
                reconciliation_group_id: groupId,
                is_duplicate: true,
                duplicate_of: bankDepositId,
                status: 'verified'
            })
            .eq('id', withdrawalId);

        if (withdrawalError) {
            logger.error('[P2P Reconciliation] Error updating withdrawal:', withdrawalError.message);
            return { success: false, error: 'Failed to update withdrawal' };
        }

        // Mark bank deposit as matched (internal transfer)
        const { error: bankError } = await adminClient
            .from('transactions')
            .update({
                reconciliation_status: 'withdrawal_matched',
                reconciliation_group_id: groupId,
                is_duplicate: true,
                duplicate_of: withdrawalId,
                status: 'verified'
            })
            .eq('id', bankDepositId);

        if (bankError) {
            logger.error('[P2P Reconciliation] Error updating bank deposit:', bankError.message);
            return { success: false, error: 'Failed to update bank deposit' };
        }

        logger.info('[P2P Reconciliation] Merged withdrawal:', { withdrawalId, bankDepositId, groupId });
        return { success: true, groupId };

    } catch (error) {
        logger.error('[P2P Reconciliation] Withdrawal merge error:', error);
        return { success: false, error: 'Unexpected error during withdrawal merge' };
    }
}

/**
 * Apply reimbursement classification to a transaction
 * All incoming P2P = reimbursements (negative expenses in chosen category)
 */
export async function applyReimbursement(
    txId: string,
    expenseCategory: string,
    linkedExpenseId?: string,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const adminClient = createAdminClient();

    // Get the transaction to ensure we have the amount
    const { data: tx, error: fetchError } = await adminClient
        .from('transactions')
        .select('amount')
        .eq('id', txId)
        .single();

    if (fetchError || !tx) {
        return { success: false, error: 'Transaction not found' };
    }

    // Update as reimbursement
    const updateData: Record<string, unknown> = {
        type: 'expense', // Reimbursements are negative expenses
        amount: -Math.abs(tx.amount), // Ensure negative
        category: expenseCategory,
        is_reimbursement: true,
        reconciliation_status: 'reimbursement',
        linked_to_transaction_id: linkedExpenseId || null,
        status: 'verified'
    };

    if (notes) {
        updateData.notes = notes;
    }

    const { error } = await adminClient
        .from('transactions')
        .update(updateData)
        .eq('id', txId);

    if (error) {
        logger.error('[P2P Reconciliation] Error applying reimbursement:', error.message);
        return { success: false, error: error.message };
    }

    logger.info('[P2P Reconciliation] Applied reimbursement:', { txId, expenseCategory, linkedExpenseId });
    return { success: true };
}

// ============================================================================
// Count Functions (for badges)
// ============================================================================

/**
 * Get count of pending reconciliation items by type
 */
export async function getPendingReconciliationCount(): Promise<{
    matches: number;
    withdrawals: number;
    reimbursements: number;
    balancePaid: number;
    total: number;
}> {
    const supabase = await createClient();

    // Get user's household
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { matches: 0, withdrawals: 0, reimbursements: 0, balancePaid: 0, total: 0 };
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { matches: 0, withdrawals: 0, reimbursements: 0, balancePaid: 0, total: 0 };
    }

    // Run full reconciliation to get accurate counts
    const result = await runP2PReconciliation();

    return {
        matches: result.matches.length,
        withdrawals: result.withdrawals.length,
        reimbursements: result.reimbursements.length,
        balancePaid: result.balancePaid.length,
        total: result.matches.length + result.withdrawals.length + result.reimbursements.length + result.balancePaid.length
    };
}

/**
 * Find recent expenses that might be related to a reimbursement
 * Used to suggest which expense category to offset
 */
export async function findRelatedExpenses(
    transactionId: string,
    lookbackDays: number = 7
): Promise<TransactionSummary[]> {
    const supabase = await createClient();

    // Get user's household
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return [];

    // Get the reimbursement transaction to know amount and date
    const { data: tx, error: txError } = await supabase
        .from('transactions')
        .select('amount, date')
        .eq('id', transactionId)
        .single();

    if (txError || !tx) return [];

    const amount = Math.abs(tx.amount);
    const date = tx.date;

    const lookbackDate = new Date(date);
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    const { data, error } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, merchant_normalized, amount, currency, type, source, category')
        .eq('household_id', profile.household_id)
        .eq('type', 'expense')
        .gte('amount', amount * 0.8) // At least 80% of reimbursement amount
        .lte('amount', amount * 5) // Up to 5x (group expense split)
        .gte('date', lookbackDate.toISOString().split('T')[0])
        .lte('date', date)
        .order('date', { ascending: false })
        .limit(5);

    if (error) {
        logger.error('[P2P Reconciliation] Error finding related expenses:', error.message);
        return [];
    }

    return (data || []) as TransactionSummary[];
}
