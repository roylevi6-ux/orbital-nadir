'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';

export type BulkStatusResult = ActionResult<{ count: number }>;

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
        return { success: false, error: 'No transaction IDs provided' };
    }

    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('transactions')
            .update({ status: newStatus })
            .eq('household_id', householdId)
            .in('id', transactionIds);

        if (error) {
            throw new Error(error.message);
        }

        return { count: transactionIds.length };
    });
}

/**
 * Update status of a single transaction
 */
export async function updateSingleTransactionStatus(
    transactionId: string,
    newStatus: 'verified' | 'verified_by_ai' | 'pending'
): Promise<BulkStatusResult> {
    return bulkUpdateStatus([transactionId], newStatus);
}

// Alias for backward compatibility
export const updateTransactionStatus = updateSingleTransactionStatus;

/**
 * Bulk update category of multiple transactions
 * @param transactionIds - Array of transaction IDs to update
 * @param newCategory - New category to set
 */
export async function bulkUpdateCategory(
    transactionIds: string[],
    newCategory: string
): Promise<BulkStatusResult> {
    if (!transactionIds || transactionIds.length === 0) {
        return { success: false, error: 'No transaction IDs provided' };
    }

    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('transactions')
            .update({ category: newCategory, status: 'verified' })
            .eq('household_id', householdId)
            .in('id', transactionIds);

        if (error) {
            throw new Error(error.message);
        }

        return { count: transactionIds.length };
    });
}
