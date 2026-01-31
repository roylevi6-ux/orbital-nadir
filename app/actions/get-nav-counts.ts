'use server';

import { createClient } from '@/lib/auth/server';

export type NavCounts = {
    total: number;
    pending: number;
    verified: number;
    skipped: number;
};

export async function getNavCounts(): Promise<NavCounts> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { total: 0, pending: 0, verified: 0, skipped: 0 };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { total: 0, pending: 0, verified: 0, skipped: 0 };

    // Use proper count queries to avoid Supabase's default 1000 row limit
    const [totalResult, pendingResult, verifiedResult, skippedResult] = await Promise.all([
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id),
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id)
            .eq('status', 'pending'),
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id)
            .in('status', ['verified', 'verified_by_ai', 'categorized']),
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id)
            .eq('status', 'skipped')
    ]);

    return {
        total: totalResult.count || 0,
        pending: pendingResult.count || 0,
        verified: verifiedResult.count || 0,
        skipped: skippedResult.count || 0
    };
}
