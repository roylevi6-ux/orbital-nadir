'use server';

import { createClient } from '@/lib/auth/server';

export interface SkippedTransaction {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string; // Add this field
    amount: number;
    currency: string;
    status: string;
    type: string; // 'expense' or 'income'
    category?: string; // The "best guess"
    ai_suggestions?: string[]; // The top 3 guesses
}

export interface ReviewResult {
    success: boolean;
    error?: string;
    updatedIds?: string[];
}

export async function getSkippedTransactions(): Promise<{ data?: SkippedTransaction[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'User not authenticated' };

    // Get household
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { error: 'No household found' };

    // Fetch transactions with status 'skipped'
    // Order by date desc
    const { data, error } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, merchant_normalized, amount, currency, status, type, category, ai_suggestions')
        .eq('household_id', profile.household_id)
        .eq('status', 'skipped')
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching skipped transactions:', error);
        return { error: 'Failed to fetch review queue' };
    }

    return { data: data || [] };
}

export async function approveTransaction(
    transactionId: string,
    category: string,
    merchantNormalized: string, // logic: derived from input or default
    notes?: string,
    learnRule: boolean = false
): Promise<ReviewResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    // Get household
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { success: false, error: 'No household' };

    const householdId = profile.household_id;

    // 0. Fetch Original Transaction (to get merchant_raw for bulk matching)
    const { data: originalTx } = await supabase
        .from('transactions')
        .select('merchant_raw')
        .eq('id', transactionId)
        .single();

    // 1. Update Target Transaction
    const updateData: any = {
        category: category,
        merchant_normalized: merchantNormalized,
        status: 'verified',
        user_verified: true
    };
    if (notes !== undefined) updateData.notes = notes;

    const { error: txError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transactionId)
        .eq('household_id', householdId);

    if (txError) {
        console.error('Update transaction failed', txError);
        return { success: false, error: 'Failed to update transaction' };
    }

    // 2. Smart Learning (Optional)
    let updatedIds: string[] = [];

    if (learnRule) {
        // A. Update Memory
        const { error: memError } = await supabase
            .from('merchant_memory')
            .upsert({
                household_id: householdId,
                merchant_normalized: merchantNormalized, // Learn the Clean Name!
                category: category,
                confidence: 100,
                correction_count: 1,
                last_seen: new Date().toISOString()
            }, {
                onConflict: 'household_id, merchant_normalized'
            });

        if (memError) console.warn('Memory update failed', memError);

        // B. Bulk Update Peers (Same raw merchant, currently pending/skipped)
        if (originalTx?.merchant_raw) {
            // First select IDs to return them
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

                const { error: bulkError } = await supabase
                    .from('transactions')
                    .update({
                        category: category,
                        merchant_normalized: merchantNormalized,
                        status: 'verified',
                        user_verified: true,
                        // We don't bulk update notes usually
                    })
                    .in('id', peerIds);

                if (bulkError) console.warn('Bulk update failed', bulkError);
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
            ai_suggestions: null // Clear old suggestions
        })
        .eq('household_id', profile.household_id)
        .eq('status', 'skipped');

    if (error) {
        console.error('Reset skipped failed', error);
        return { success: false, error: 'Failed to reset transactions' };
    }

    return { success: true };
}
