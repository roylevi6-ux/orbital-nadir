'use server';

import { createClient } from '@/lib/auth/server';
import { withAuth, ActionResult } from '@/lib/auth/context';

export interface SkippedTransaction {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string;
    amount: number;
    currency: string;
    status: string;
    type: string;
    category?: string;
    ai_suggestions?: string[];
}

export interface ReviewResult {
    success: boolean;
    error?: string;
    updatedIds?: string[];
}

export async function getSkippedTransactions(): Promise<ActionResult<SkippedTransaction[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, date, merchant_raw, merchant_normalized, amount, currency, status, type, category, ai_suggestions')
            .eq('household_id', householdId)
            .eq('status', 'skipped')
            .order('date', { ascending: false });

        if (error) {
            throw new Error('Failed to fetch review queue');
        }

        return data || [];
    });
}

interface TransactionUpdateData {
    category: string;
    merchant_normalized: string;
    status: string;
    user_verified: boolean;
    notes?: string;
    is_reimbursement?: boolean;
}

export async function approveTransaction(
    transactionId: string,
    category: string,
    merchantNormalized: string,
    notes?: string,
    learnRule: boolean = false,
    isReimbursement?: boolean
): Promise<ReviewResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { success: false, error: 'No household' };

    const householdId = profile.household_id;

    const { data: originalTx } = await supabase
        .from('transactions')
        .select('merchant_raw')
        .eq('id', transactionId)
        .single();

    const updateData: TransactionUpdateData = {
        category: category,
        merchant_normalized: merchantNormalized,
        status: 'verified',
        user_verified: true
    };
    if (notes !== undefined) updateData.notes = notes;
    if (isReimbursement !== undefined) updateData.is_reimbursement = isReimbursement;

    const { error: txError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transactionId)
        .eq('household_id', householdId);

    if (txError) {
        return { success: false, error: 'Failed to update transaction' };
    }

    let updatedIds: string[] = [];

    if (learnRule) {
        await supabase
            .from('merchant_memory')
            .upsert({
                household_id: householdId,
                merchant_normalized: merchantNormalized,
                category: category,
                confidence: 100,
                correction_count: 1,
                last_seen: new Date().toISOString()
            }, {
                onConflict: 'household_id, merchant_normalized'
            });

        if (originalTx?.merchant_raw) {
            const { data: peers } = await supabase
                .from('transactions')
                .select('id')
                .eq('household_id', householdId)
                .eq('merchant_raw', originalTx.merchant_raw)
                .in('status', ['pending', 'skipped', 'uncategorized'])
                .neq('id', transactionId);

            if (peers && peers.length > 0) {
                const peerIds = peers.map(p => p.id);
                updatedIds = peerIds;

                await supabase
                    .from('transactions')
                    .update({
                        category: category,
                        merchant_normalized: merchantNormalized,
                        status: 'verified',
                        user_verified: true,
                    })
                    .in('id', peerIds);
            }
        }
    }

    return { success: true, updatedIds };
}

// Fetch categories filtered by type (default to 'expense' if not specified)
export async function getCategoryNames(type: string = 'expense'): Promise<string[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from('categories')
        .select('name_english')
        .eq('type', type) // Filter by type!
        .order('name_english');
    return data?.map(c => c.name_english) || [];
}

export async function retrySkippedTransactions(): Promise<ReviewResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { success: false, error: 'No household' };

    const { error } = await supabase
        .from('transactions')
        .update({
            status: 'pending',
            ai_suggestions: null
        })
        .eq('household_id', profile.household_id)
        .eq('status', 'skipped');

    if (error) {
        return { success: false, error: 'Failed to reset transactions' };
    }

    return { success: true };
}
