'use server';

import { createClient } from '@/lib/auth/server';

export async function deleteAllTransactions() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Not authenticated');

    // Get household_id
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    const householdId = profile?.household_id;
    if (!householdId) throw new Error('No household');

    // Delete ALL transactions for this household
    const { error, count } = await supabase
        .from('transactions')
        .delete({ count: 'exact' })
        .eq('household_id', householdId);

    if (error) {
        console.error('Delete All Error:', error);
        throw new Error(error.message);
    }

    return { success: true, count };
}
