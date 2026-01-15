'use server';

import { createClient } from '@/lib/auth/server';

export type NavCounts = {
    pending: number;
    skipped: number;
};

export async function getNavCounts(): Promise<NavCounts> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { pending: 0, skipped: 0 };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { pending: 0, skipped: 0 };

    // Efficiently count grouped by status
    const { data, error } = await supabase
        .from('transactions')
        .select('status')
        .eq('household_id', profile.household_id)
        .in('status', ['pending', 'skipped']);

    if (error) {
        console.error('Error fetching nav counts:', error);
        return { pending: 0, skipped: 0 };
    }

    // Count in memory (usually small number of pending items) 
    // or use .rpc() if this scales poorly, but for <1000 pending items this is fine and saves DB calls.
    // Actually, distinct counts via SQL is better but Supabase JS select count is easier.
    // Let's do two lightweight count queries or one aggregation.

    // Aggregation in JS for now as it's simple
    const pending = data.filter(t => t.status === 'pending').length;
    const skipped = data.filter(t => t.status === 'skipped').length;

    return { pending, skipped };
}
