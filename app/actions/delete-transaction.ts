'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';

export async function deleteTransaction(transactionId: string): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', transactionId)
            .eq('household_id', householdId);

        if (error) {
            throw new Error(error.message);
        }
    });
}
