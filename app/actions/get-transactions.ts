'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';

export interface Transaction {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string;
    amount: number;
    currency: string;
    category?: string;
    status: string;
    ai_suggestions?: string[];
    type: string;
    notes?: string;
    receipt_id?: string;
    is_reimbursement?: boolean;
}

export async function getTransactions(
    filter: 'all' | 'review' | 'verified' = 'all',
    limit: number = 1000
): Promise<ActionResult<Transaction[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        let query = supabase
            .from('transactions')
            .select('id, date, merchant_raw, merchant_normalized, amount, currency, category, status, ai_suggestions, type, notes, receipt_id, is_reimbursement')
            .eq('household_id', householdId)
            .order('date', { ascending: false })
            .limit(limit);

        if (filter === 'review') {
            query = query.in('status', ['skipped', 'pending', 'flagged']);
        } else if (filter === 'verified') {
            query = query.in('status', ['verified', 'categorized']);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error('Failed to fetch transactions');
        }

        return data || [];
    });
}
