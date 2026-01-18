'use server';

import { createClient } from '@/lib/auth/server';
import { revalidatePath } from 'next/cache';

export type MemorizeChoice = 'none' | 'remember' | 'current_only' | 'all_past' | 'future_only';

interface UpdateResult {
    success: boolean;
    updatedCount?: number;
    error?: string;
}

/**
 * Update a transaction's category with Smart Merchant Memory support
 * 
 * @param transactionId - The transaction to update
 * @param category - New category (or null to clear)
 * @param merchantNormalized - Clean merchant name for memory
 * @param memorizeChoice - How to handle merchant memory:
 *   - 'none': Just update this transaction, don't touch memory
 *   - 'remember': Save to memory for future transactions
 *   - 'current_only': Update only this transaction (don't change memory)
 *   - 'all_past': Update all past transactions with this merchant + update memory
 *   - 'future_only': Update this transaction + update memory (but not past entries)
 */
export async function updateTransactionCategory(
    transactionId: string,
    category: string | null,
    merchantNormalized?: string | null,
    memorizeChoice: MemorizeChoice = 'none'
): Promise<UpdateResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    // Get Household ID
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { success: false, error: 'No household' };

    let updatedCount = 0;

    // Handle different memorize choices
    switch (memorizeChoice) {
        case 'all_past': {
            // Update ALL transactions with this merchant + update memory
            if (merchantNormalized && category) {
                // Try bulk update via RPC (fuzzy match)
                const { createClient: createAdmin } = require('@supabase/supabase-js');
                const adminClient = createAdmin(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!,
                    { auth: { autoRefreshToken: false, persistSession: false } }
                );

                // Try RPC function first
                try {
                    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
                        'bulk_update_merchant_category',
                        {
                            p_household_id: profile.household_id,
                            p_merchant_pattern: merchantNormalized,
                            p_new_category: category,
                            p_fuzzy_match: true
                        }
                    );

                    if (!rpcError && typeof rpcResult === 'number') {
                        updatedCount = rpcResult;
                    } else {
                        throw new Error('RPC failed');
                    }
                } catch {
                    // Fallback: Use ILIKE query manually
                    const { data: matchingTxs } = await supabase
                        .from('transactions')
                        .select('id')
                        .eq('household_id', profile.household_id)
                        .ilike('merchant_normalized', `%${merchantNormalized}%`);

                    if (matchingTxs && matchingTxs.length > 0) {
                        const { error } = await supabase
                            .from('transactions')
                            .update({ category, status: 'verified' })
                            .in('id', matchingTxs.map(t => t.id));

                        if (!error) updatedCount = matchingTxs.length;
                    }
                }

                // Update memory
                await supabase
                    .from('merchant_memory')
                    .upsert({
                        household_id: profile.household_id,
                        merchant_normalized: merchantNormalized,
                        category: category,
                        last_used: new Date().toISOString(),
                        confidence_score: 100
                    }, { onConflict: 'household_id, merchant_normalized' });
            }
            break;
        }

        case 'remember':
        case 'future_only': {
            // Update this transaction + save to memory
            const { error } = await supabase
                .from('transactions')
                .update({
                    category: category,
                    status: 'verified',
                    ...(merchantNormalized ? { merchant_normalized: merchantNormalized } : {})
                })
                .eq('id', transactionId)
                .eq('household_id', profile.household_id);

            if (error) return { success: false, error: error.message };
            updatedCount = 1;

            // Save to memory
            if (merchantNormalized && category) {
                await supabase
                    .from('merchant_memory')
                    .upsert({
                        household_id: profile.household_id,
                        merchant_normalized: merchantNormalized,
                        category: category,
                        last_used: new Date().toISOString(),
                        confidence_score: 100
                    }, { onConflict: 'household_id, merchant_normalized' });
            }
            break;
        }

        case 'current_only':
        case 'none':
        default: {
            // Just update this transaction, don't touch memory
            const { error } = await supabase
                .from('transactions')
                .update({
                    category: category,
                    status: 'verified',
                    ...(merchantNormalized ? { merchant_normalized: merchantNormalized } : {})
                })
                .eq('id', transactionId)
                .eq('household_id', profile.household_id);

            if (error) return { success: false, error: error.message };
            updatedCount = 1;
            break;
        }
    }

    revalidatePath('/dashboard');
    revalidatePath('/transactions');
    revalidatePath('/review');

    return { success: true, updatedCount };
}

/**
 * Quick update for transaction status only (no memory dialog)
 */
export async function updateTransactionStatus(
    transactionId: string,
    status: 'verified' | 'pending' | 'skipped' | 'verified_by_ai'
): Promise<UpdateResult> {
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
        .update({ status })
        .eq('id', transactionId)
        .eq('household_id', profile.household_id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/transactions');
    return { success: true, updatedCount: 1 };
}
