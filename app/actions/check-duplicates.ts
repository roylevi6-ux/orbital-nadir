'use server';

import { createClient } from '@/lib/auth/server';
import { logger } from '@/lib/logger';

export interface DuplicateMatch {
    newTransaction: {
        date: string;
        merchant_raw: string;
        amount: number;
    };
    existingTransaction: {
        id: string;
        date: string;
        merchant_raw: string;
        merchant_normalized?: string;
        amount: number;
        category?: string;
        status: string;
    };
    confidence: number;
    reason: string;
}

export interface DuplicateCheckResult {
    hasDuplicates: boolean;
    matches: DuplicateMatch[];
    cleanTransactions: number; // Count of non-duplicate transactions
}

/**
 * Check for potential duplicates BEFORE saving transactions
 * Called during upload flow to detect duplicates before they're inserted
 * 
 * @param transactions - Array of parsed transactions to check
 * @returns Object with duplicate matches and clean transaction count
 */
export async function checkForDuplicates(
    transactions: Array<{ date: string; merchant_raw: string; amount: number }>
): Promise<DuplicateCheckResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('Not authenticated');
    }

    // Get household ID
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        throw new Error('No household found');
    }

    // Get date range for query (expand by 5 days on each side)
    const dates = transactions.map(t => new Date(t.date).getTime());
    const minDate = new Date(Math.min(...dates) - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const maxDate = new Date(Math.max(...dates) + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch existing transactions in date range
    const { data: existingTxs } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, merchant_normalized, amount, category, status')
        .eq('household_id', profile.household_id)
        .gte('date', minDate)
        .lte('date', maxDate);

    if (!existingTxs || existingTxs.length === 0) {
        return { hasDuplicates: false, matches: [], cleanTransactions: transactions.length };
    }

    const matches: DuplicateMatch[] = [];
    const matchedNewIndices = new Set<number>();

    // Check each new transaction against existing ones
    for (let i = 0; i < transactions.length; i++) {
        const newTx = transactions[i];
        const newDate = new Date(newTx.date).getTime();
        const newAmountAbs = Math.abs(newTx.amount);

        for (const existingTx of existingTxs) {
            const existingDate = new Date(existingTx.date).getTime();
            const existingAmountAbs = Math.abs(existingTx.amount);

            // Rule 1: Date within ±3 days
            const daysDiff = Math.abs(newDate - existingDate) / (1000 * 60 * 60 * 24);
            if (daysDiff > 3) continue;

            // Rule 2: Absolute amount within ±₪1
            const amountDiff = Math.abs(newAmountAbs - existingAmountAbs);
            if (amountDiff > 1) continue;

            // Found a potential duplicate!
            let confidence = 80; // Base confidence
            let reasons: string[] = [];

            if (daysDiff === 0) {
                confidence += 10;
                reasons.push('Same day');
            } else {
                reasons.push(`${daysDiff.toFixed(0)} day(s) apart`);
            }

            if (amountDiff < 0.01) {
                confidence += 10;
                reasons.push('Exact amount match');
            } else {
                reasons.push(`₪${amountDiff.toFixed(2)} difference`);
            }

            // Check for BIT/Paybox pattern
            const isBitPaybox =
                existingTx.merchant_raw?.match(/ביט|bit|paybox/i) ||
                newTx.merchant_raw?.match(/ביט|bit|paybox/i);

            if (isBitPaybox) {
                confidence = Math.min(confidence + 5, 100);
                reasons.push('BIT/Paybox pattern detected');
            }

            matches.push({
                newTransaction: {
                    date: newTx.date,
                    merchant_raw: newTx.merchant_raw,
                    amount: newTx.amount
                },
                existingTransaction: {
                    id: existingTx.id,
                    date: existingTx.date,
                    merchant_raw: existingTx.merchant_raw,
                    merchant_normalized: existingTx.merchant_normalized || undefined,
                    amount: existingTx.amount,
                    category: existingTx.category || undefined,
                    status: existingTx.status
                },
                confidence,
                reason: reasons.join(', ')
            });

            matchedNewIndices.add(i);
            break; // Only match each new transaction once
        }
    }

    logger.debug(`[DuplicateCheck] Found ${matches.length} potential duplicates out of ${transactions.length} transactions`);

    return {
        hasDuplicates: matches.length > 0,
        matches,
        cleanTransactions: transactions.length - matchedNewIndices.size
    };
}
