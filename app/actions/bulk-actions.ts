'use server';

import { createClient } from '@/lib/auth/server';

export interface BulkUpdateResult {
    success: boolean;
    error?: string;
    updatedCount?: number;
}

export async function bulkUpdateTransactions(
    transactionIds: string[],
    category: string
): Promise<BulkUpdateResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { success: false, error: 'No household' };

    const { error, count } = await supabase
        .from('transactions')
        .update({
            category: category,
            status: 'verified',
            user_verified: true
        })
        .eq('household_id', profile.household_id)
        .in('id', transactionIds);

    if (error) {
        console.error('Bulk update failed', error);
        return { success: false, error: 'Failed to update transactions' };
    }

    return { success: true, updatedCount: transactionIds.length }; // count is sometimes null depending on headers
}
