'use server';

import { createClient } from '@/lib/auth/server';

export type BulkStatusResult = {
    success: boolean;
    count: number;
    error?: string;
};

/**
 * Bulk update status of multiple transactions
 * @param transactionIds - Array of transaction IDs to update
 * @param newStatus - New status to set ('verified' | 'verified_by_ai' | 'pending')
 */
export async function bulkUpdateStatus(
    transactionIds: string[],
    newStatus: 'verified' | 'verified_by_ai' | 'pending'
): Promise<BulkStatusResult> {
    if (!transactionIds || transactionIds.length === 0) {
        return { success: false, count: 0, error: 'No transaction IDs provided' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, count: 0, error: 'Not authenticated' };
    }

    // Get household ID for this user
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, count: 0, error: 'No household found' };
    }

    // Update transactions in bulk
    const { error } = await supabase
        .from('transactions')
        .update({ status: newStatus })
        .eq('household_id', profile.household_id)
        .in('id', transactionIds);

    if (error) {
        console.error('Bulk status update error:', error);
        return { success: false, count: 0, error: error.message };
    }

    return { success: true, count: transactionIds.length };
}

/**
 * Update status of a single transaction
 */
export async function updateTransactionStatus(
    transactionId: string,
    newStatus: 'verified' | 'verified_by_ai' | 'pending'
): Promise<BulkStatusResult> {
    return bulkUpdateStatus([transactionId], newStatus);
}
