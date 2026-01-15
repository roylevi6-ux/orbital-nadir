'use server';

import { createClient } from '@/lib/auth/server';

export async function deleteTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // 1. Authenticate User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'User not authenticated' };
    }

    // 2. Get household_id for security check
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household found' };
    }

    // 3. Verify transaction belongs to user's household before deleting
    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId)
        .eq('household_id', profile.household_id); // Security: only delete if belongs to household

    if (error) {
        console.error('Delete transaction error:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}
