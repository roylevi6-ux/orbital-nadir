'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';
import { createAdminClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';
import type { ParsedSmsReceipt, CardProvider } from '@/lib/sms-utils';
import type { Spender } from '@/lib/spender-utils';

export interface SmsTransaction {
    id: string;
    household_id: string;
    card_ending: string;
    merchant_name: string | null;
    amount: number;
    currency: string;
    transaction_date: string;
    spender: Spender | null;
    provider: CardProvider;
    raw_message: string;
    transaction_id: string | null;
    cc_matched: boolean;
    cc_matched_at: string | null;
    received_at: string;
}

export interface SmsMatchResult {
    matched: boolean;
    sms_id: string;
    transaction_id: string | null;
    confidence: number;
}

export interface CcSlipMatchResult {
    matched: boolean;
    sms_transaction: SmsTransaction | null;
    confidence: number;
}

/**
 * Store a parsed SMS receipt in the database and create a provisional transaction
 */
export async function storeSmsTransaction(
    smsData: ParsedSmsReceipt,
    spender: Spender | null
): Promise<ActionResult<{ smsId: string; transactionId: string }>> {
    return withAuth(async ({ supabase, householdId }) => {
        // First check for duplicate SMS (same amount, date, card within last hour)
        const { data: existing } = await supabase
            .from('sms_transactions')
            .select('id')
            .eq('household_id', householdId)
            .eq('card_ending', smsData.card_ending)
            .eq('amount', smsData.amount)
            .eq('transaction_date', smsData.transaction_date)
            .gte('received_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .limit(1);

        if (existing && existing.length > 0) {
            logger.info('[SMS Dedup] Duplicate SMS detected, skipping:', existing[0].id);
            throw new Error('Duplicate SMS detected');
        }

        // Create the provisional transaction first
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
                household_id: householdId,
                date: smsData.transaction_date,
                merchant_raw: smsData.merchant_name || 'Unknown',
                merchant_normalized: smsData.merchant_name,
                amount: smsData.amount,
                currency: smsData.currency,
                type: 'expense',
                source: 'sms',
                status: 'provisional',
                spender,
                source_priority: 'sms',
                category_source: null  // Will be set when auto-categorized
            })
            .select('id')
            .single();

        if (txError) {
            logger.error('[SMS Dedup] Failed to create provisional transaction:', txError);
            throw new Error('Failed to create provisional transaction');
        }

        // Now store the SMS record
        const { data: smsRecord, error: smsError } = await supabase
            .from('sms_transactions')
            .insert({
                household_id: householdId,
                card_ending: smsData.card_ending,
                merchant_name: smsData.merchant_name,
                amount: smsData.amount,
                currency: smsData.currency,
                transaction_date: smsData.transaction_date,
                spender,
                provider: smsData.provider,
                raw_message: smsData.raw_message,
                transaction_id: transaction.id,
                cc_matched: false
            })
            .select('id')
            .single();

        if (smsError) {
            logger.error('[SMS Dedup] Failed to store SMS record:', smsError);
            // Try to clean up the transaction
            await supabase.from('transactions').delete().eq('id', transaction.id);
            throw new Error('Failed to store SMS record');
        }

        // Update the transaction with the SMS ID
        await supabase
            .from('transactions')
            .update({ sms_id: smsRecord.id })
            .eq('id', transaction.id);

        logger.info('[SMS Dedup] Stored SMS transaction:', {
            smsId: smsRecord.id,
            transactionId: transaction.id,
            amount: smsData.amount,
            merchant: smsData.merchant_name
        });

        return {
            smsId: smsRecord.id,
            transactionId: transaction.id
        };
    });
}

/**
 * Admin version of storeSmsTransaction for webhook context (no user auth)
 * Uses admin client and requires householdId to be passed explicitly
 */
export async function storeSmsTransactionAdmin(
    householdId: string,
    smsData: ParsedSmsReceipt,
    spender: Spender | null
): Promise<{ success: true; data: { smsId: string; transactionId: string } } | { success: false; error: string }> {
    const adminClient = createAdminClient();

    try {
        // First check for duplicate SMS (same amount, date, card within last hour)
        const { data: existing } = await adminClient
            .from('sms_transactions')
            .select('id')
            .eq('household_id', householdId)
            .eq('card_ending', smsData.card_ending)
            .eq('amount', smsData.amount)
            .eq('transaction_date', smsData.transaction_date)
            .gte('received_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .limit(1);

        if (existing && existing.length > 0) {
            logger.info('[SMS Dedup Admin] Duplicate SMS detected, skipping:', existing[0].id);
            return { success: false, error: 'Duplicate SMS detected' };
        }

        // Create the provisional transaction first
        const { data: transaction, error: txError } = await adminClient
            .from('transactions')
            .insert({
                household_id: householdId,
                date: smsData.transaction_date,
                merchant_raw: smsData.merchant_name || 'Unknown',
                merchant_normalized: smsData.merchant_name,
                amount: smsData.amount,
                currency: smsData.currency,
                type: 'expense',
                source: 'sms',
                status: 'provisional',
                spender,
                source_priority: 'sms',
                category_source: null
            })
            .select('id')
            .single();

        if (txError) {
            logger.error('[SMS Dedup Admin] Failed to create provisional transaction:', txError);
            return { success: false, error: 'Failed to create provisional transaction: ' + txError.message };
        }

        // Now store the SMS record
        const { data: smsRecord, error: smsError } = await adminClient
            .from('sms_transactions')
            .insert({
                household_id: householdId,
                card_ending: smsData.card_ending,
                merchant_name: smsData.merchant_name,
                amount: smsData.amount,
                currency: smsData.currency,
                transaction_date: smsData.transaction_date,
                spender,
                provider: smsData.provider,
                raw_message: smsData.raw_message,
                transaction_id: transaction.id,
                cc_matched: false
            })
            .select('id')
            .single();

        if (smsError) {
            logger.error('[SMS Dedup Admin] Failed to store SMS record:', smsError);
            // Try to clean up the transaction
            await adminClient.from('transactions').delete().eq('id', transaction.id);
            return { success: false, error: 'Failed to store SMS record: ' + smsError.message };
        }

        // Update the transaction with the SMS ID
        await adminClient
            .from('transactions')
            .update({ sms_id: smsRecord.id })
            .eq('id', transaction.id);

        logger.info('[SMS Dedup Admin] Stored SMS transaction:', {
            smsId: smsRecord.id,
            transactionId: transaction.id,
            amount: smsData.amount,
            merchant: smsData.merchant_name
        });

        return {
            success: true,
            data: {
                smsId: smsRecord.id,
                transactionId: transaction.id
            }
        };
    } catch (error) {
        logger.error('[SMS Dedup Admin] Unexpected error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Check if an SMS with the same details already exists (for duplicate detection)
 */
export async function isDuplicateSms(
    smsData: ParsedSmsReceipt
): Promise<ActionResult<boolean>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('sms_transactions')
            .select('id')
            .eq('household_id', householdId)
            .eq('card_ending', smsData.card_ending)
            .eq('amount', smsData.amount)
            .eq('transaction_date', smsData.transaction_date)
            .gte('received_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

        if (error) {
            logger.error('[SMS Dedup] Failed to check for duplicate:', error);
            throw new Error('Failed to check for duplicate SMS');
        }

        return data && data.length > 0;
    });
}

/**
 * Admin version of isDuplicateSms for webhook context
 */
export async function isDuplicateSmsAdmin(
    householdId: string,
    smsData: ParsedSmsReceipt
): Promise<boolean> {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient
        .from('sms_transactions')
        .select('id')
        .eq('household_id', householdId)
        .eq('card_ending', smsData.card_ending)
        .eq('amount', smsData.amount)
        .eq('transaction_date', smsData.transaction_date)
        .gte('received_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

    if (error) {
        logger.error('[SMS Dedup Admin] Failed to check for duplicate:', error);
        return false; // Fail open - don't block on error
    }

    return data && data.length > 0;
}

/**
 * Find matching SMS transaction for a CC slip entry
 * Uses: exact amount, date ±1 day, card must match if both have it
 */
export async function findMatchingSmsForCcSlip(
    amount: number,
    date: string,
    cardEnding?: string
): Promise<ActionResult<CcSlipMatchResult>> {
    return withAuth(async ({ supabase, householdId }) => {
        // Calculate date range (±1 day)
        const dateObj = new Date(date);
        const dateStart = new Date(dateObj);
        dateStart.setDate(dateStart.getDate() - 1);
        const dateEnd = new Date(dateObj);
        dateEnd.setDate(dateEnd.getDate() + 1);

        // Query for matching SMS
        let query = supabase
            .from('sms_transactions')
            .select('*')
            .eq('household_id', householdId)
            .eq('cc_matched', false)
            .eq('amount', amount)
            .gte('transaction_date', dateStart.toISOString().split('T')[0])
            .lte('transaction_date', dateEnd.toISOString().split('T')[0]);

        // If we have card ending from CC slip, must match
        if (cardEnding) {
            query = query.eq('card_ending', cardEnding);
        }

        const { data, error } = await query.limit(5);

        if (error) {
            logger.error('[SMS Dedup] Failed to find matching SMS:', error);
            throw new Error('Failed to find matching SMS');
        }

        if (!data || data.length === 0) {
            return {
                matched: false,
                sms_transaction: null,
                confidence: 0
            };
        }

        // Score candidates and return best match
        const scoredCandidates = data.map(sms => {
            let score = 50;  // Base score for amount match

            // Same day bonus
            if (sms.transaction_date === date) {
                score += 30;
            } else {
                score += 20;  // ±1 day
            }

            // Card ending match bonus
            if (cardEnding && sms.card_ending === cardEnding) {
                score += 15;
            }

            return { sms, score };
        });

        // Sort by score descending
        scoredCandidates.sort((a, b) => b.score - a.score);

        const bestMatch = scoredCandidates[0];

        if (bestMatch.score >= 80) {
            logger.info('[SMS Dedup] Found SMS match:', {
                smsId: bestMatch.sms.id,
                score: bestMatch.score
            });

            return {
                matched: true,
                sms_transaction: bestMatch.sms as SmsTransaction,
                confidence: bestMatch.score
            };
        }

        return {
            matched: false,
            sms_transaction: null,
            confidence: bestMatch.score
        };
    });
}

/**
 * Merge CC slip data into existing SMS transaction
 * Preserves SMS merchant name (cleaner) and existing category
 */
export async function mergeCcSlipWithSms(
    smsTransactionId: string,
    ccSlipData: {
        date: string;
        amount: number;
        merchantRaw: string;
        sourceFile: string;
        sourceRow: number;
    }
): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase }) => {
        // Get the SMS transaction to find linked transaction
        const { data: sms, error: smsError } = await supabase
            .from('sms_transactions')
            .select('transaction_id, merchant_name')
            .eq('id', smsTransactionId)
            .single();

        if (smsError || !sms?.transaction_id) {
            logger.error('[SMS Dedup] Failed to get SMS transaction:', smsError);
            throw new Error('SMS transaction not found');
        }

        // Get the current transaction to preserve category
        const { data: tx, error: txError } = await supabase
            .from('transactions')
            .select('category, category_source, merchant_normalized')
            .eq('id', sms.transaction_id)
            .single();

        if (txError) {
            logger.error('[SMS Dedup] Failed to get transaction:', txError);
            throw new Error('Transaction not found');
        }

        // Determine best merchant name (prefer SMS if it has Hebrew)
        const smsMerchant = sms.merchant_name || '';
        const ccMerchant = ccSlipData.merchantRaw || '';
        const smsHasHebrew = /[א-ת]/.test(smsMerchant);
        const ccHasHebrew = /[א-ת]/.test(ccMerchant);

        let bestMerchant = tx.merchant_normalized;
        if (smsHasHebrew && !ccHasHebrew) {
            bestMerchant = smsMerchant;
        } else if (ccHasHebrew && !smsHasHebrew) {
            bestMerchant = ccMerchant;
        } else if (smsMerchant.length >= ccMerchant.length) {
            bestMerchant = smsMerchant;
        } else {
            bestMerchant = ccMerchant;
        }

        // Update the transaction - CC slip is authority for amount/date
        // but preserve existing category
        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                // CC slip wins for amount/date
                date: ccSlipData.date,
                amount: ccSlipData.amount,
                // Preserve SMS merchant if better
                merchant_normalized: bestMerchant || tx.merchant_normalized,
                // Keep existing category (NEVER override)
                category: tx.category,
                category_source: tx.category_source,
                // Update status and source tracking
                status: 'pending',  // Confirmed by CC slip
                source_file: ccSlipData.sourceFile,
                source_row: ccSlipData.sourceRow,
                cc_slip_linked_at: new Date().toISOString()
            })
            .eq('id', sms.transaction_id);

        if (updateError) {
            logger.error('[SMS Dedup] Failed to update transaction:', updateError);
            throw new Error('Failed to merge CC slip with SMS');
        }

        // Mark SMS as matched
        const { error: smsUpdateError } = await supabase
            .from('sms_transactions')
            .update({
                cc_matched: true,
                cc_matched_at: new Date().toISOString()
            })
            .eq('id', smsTransactionId);

        if (smsUpdateError) {
            logger.error('[SMS Dedup] Failed to mark SMS as matched:', smsUpdateError);
            // Non-fatal, transaction is already updated
        }

        logger.info('[SMS Dedup] Merged CC slip with SMS:', {
            smsId: smsTransactionId,
            transactionId: sms.transaction_id
        });
    });
}

/**
 * Get unmatched SMS transactions (for flagging after 30 days)
 */
export async function getUnmatchedSmsTransactions(
    olderThanDays: number = 30
): Promise<ActionResult<SmsTransaction[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const { data, error } = await supabase
            .from('sms_transactions')
            .select('*')
            .eq('household_id', householdId)
            .eq('cc_matched', false)
            .lt('received_at', cutoffDate.toISOString());

        if (error) {
            logger.error('[SMS Dedup] Failed to get unmatched SMS:', error);
            throw new Error('Failed to get unmatched SMS transactions');
        }

        return data || [];
    });
}

/**
 * Flag unmatched SMS transactions as needing review
 */
export async function flagUnmatchedSmsTransactions(): Promise<ActionResult<number>> {
    return withAuth(async ({ supabase, householdId }) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);

        // Get unmatched SMS
        const { data: unmatched, error: fetchError } = await supabase
            .from('sms_transactions')
            .select('transaction_id')
            .eq('household_id', householdId)
            .eq('cc_matched', false)
            .lt('received_at', cutoffDate.toISOString())
            .not('transaction_id', 'is', null);

        if (fetchError) {
            logger.error('[SMS Dedup] Failed to fetch unmatched SMS:', fetchError);
            throw new Error('Failed to fetch unmatched SMS');
        }

        if (!unmatched || unmatched.length === 0) {
            return 0;
        }

        const transactionIds = unmatched
            .map(s => s.transaction_id)
            .filter((id): id is string => id !== null);

        // Flag the linked transactions
        const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'flagged' })
            .in('id', transactionIds)
            .eq('status', 'provisional');  // Only flag if still provisional

        if (updateError) {
            logger.error('[SMS Dedup] Failed to flag transactions:', updateError);
            throw new Error('Failed to flag transactions');
        }

        logger.info('[SMS Dedup] Flagged unmatched SMS transactions:', transactionIds.length);

        return transactionIds.length;
    });
}

/**
 * Get SMS source data for a transaction (for detail view)
 */
export async function getSmsSourceForTransaction(
    transactionId: string
): Promise<ActionResult<SmsTransaction | null>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('sms_transactions')
            .select('*')
            .eq('household_id', householdId)
            .eq('transaction_id', transactionId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('[SMS Dedup] Failed to get SMS source:', error);
            throw new Error('Failed to get SMS source');
        }

        return data as SmsTransaction | null;
    });
}
