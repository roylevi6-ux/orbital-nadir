'use server';

import { createClient } from '@/lib/auth/server';

export async function getReviewCount(): Promise<number> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return 0;

    const { count, error } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true }) // head: true means do not return data, just count
        .eq('household_id', profile.household_id)
        .in('status', ['skipped', 'pending']);

    if (error) {
        console.error('Error counting review items:', error);
        return 0;
    }

    return count || 0;
}
