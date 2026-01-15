'use server';

import { createClient } from '@/lib/auth/server';

export interface Transaction {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string;
    amount: number;
    currency: string;
    category?: string;
    status: string; // 'pending', 'categorized', 'skipped', 'verified'
    ai_suggestions?: string[];
    type: string;
    notes?: string;
}

export async function getTransactions(
    filter: 'all' | 'review' | 'verified' = 'all',
    limit: number = 1000
): Promise<{ data?: Transaction[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { error: 'No household' };

    let query = supabase
        .from('transactions')
        .select('id, date, merchant_raw, merchant_normalized, amount, currency, category, status, ai_suggestions, type, notes')
        .eq('household_id', profile.household_id)
        .order('date', { ascending: false })
        .limit(limit);

    if (filter === 'review') {
        // "Review" means skipped (low confidence) OR pending (no run yet).
        // Or maybe just 'skipped'? The user wants to see "Needs Review".
        // Let's include 'skipped' and 'pending'.
        query = query.in('status', ['skipped', 'pending']);
    } else if (filter === 'verified') {
        // "Verified" = explicitly approved by user OR high confidence auto
        // Status 'verified' (user) or 'categorized' (AI high conf).
        query = query.in('status', ['verified', 'categorized']);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Fetch transactions error', error);
        return { error: 'Failed to fetch transactions' };
    }

    return { data: data || [] };
}
