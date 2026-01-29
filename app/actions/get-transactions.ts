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
    limit?: number
): Promise<ActionResult<Transaction[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        let query = supabase
            .from('transactions')
            .select('id, date, merchant_raw, merchant_normalized, amount, currency, category, status, ai_suggestions, type, notes, receipt_id, is_reimbursement')
            .eq('household_id', householdId)
            .order('date', { ascending: false });

        // Apply limit - use provided value or a large number to override Supabase's default 1000 limit
        query = query.limit(limit || 50000);

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
