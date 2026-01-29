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

    // Use proper count queries to avoid Supabase's default 1000 row limit
    const [pendingResult, skippedResult] = await Promise.all([
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id)
            .eq('status', 'pending'),
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id)
            .eq('status', 'skipped')
    ]);

    return {
        pending: pendingResult.count || 0,
        skipped: skippedResult.count || 0
    };
}
