'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';
import { parseISO } from 'date-fns';

export interface SpenderStats {
    spender_key: string;
    display_name: string;
    color: string;
    total_amount: number;
    transaction_count: number;
    percentage: number;
}

export interface SpenderBreakdown {
    spenders: SpenderStats[];
    total_expenses: number;
    unassigned: {
        amount: number;
        count: number;
        percentage: number;
    };
}

/**
 * Get spending breakdown by spender for the dashboard
 */
export async function getSpenderBreakdown(
    from?: string,
    to?: string
): Promise<ActionResult<SpenderBreakdown>> {
    return withAuth(async ({ supabase, householdId }) => {
        // Get spender configuration
        const { data: spenderConfig, error: configError } = await supabase
            .from('household_spenders')
            .select('spender_key, display_name, color')
            .eq('household_id', householdId);

        if (configError) {
            throw new Error('Failed to fetch spender config');
        }

        // Get transactions within the date range
        let query = supabase
            .from('transactions')
            .select('amount, type, spender, is_reimbursement')
            .eq('household_id', householdId)
            .eq('type', 'expense');

        if (from) {
            query = query.gte('date', from);
        }
        if (to) {
            query = query.lte('date', to);
        }

        const { data: transactions, error: txError } = await query;

        if (txError) {
            throw new Error('Failed to fetch transactions');
        }

        // Also get reimbursements (income type with is_reimbursement=true)
        let reimbQuery = supabase
            .from('transactions')
            .select('amount, type, spender, is_reimbursement')
            .eq('household_id', householdId)
            .eq('type', 'income')
            .eq('is_reimbursement', true);

        if (from) {
            reimbQuery = reimbQuery.gte('date', from);
        }
        if (to) {
            reimbQuery = reimbQuery.lte('date', to);
        }

        const { data: reimbursements } = await reimbQuery;

        // Calculate totals by spender
        const spenderTotals = new Map<string | null, { amount: number; count: number }>();

        // Process expenses
        (transactions || []).forEach(tx => {
            const spender = tx.spender || null;
            const current = spenderTotals.get(spender) || { amount: 0, count: 0 };
            current.amount += Math.abs(Number(tx.amount));
            current.count += 1;
            spenderTotals.set(spender, current);
        });

        // Deduct reimbursements
        (reimbursements || []).forEach(tx => {
            const spender = tx.spender || null;
            const current = spenderTotals.get(spender);
            if (current) {
                current.amount -= Math.abs(Number(tx.amount));
            }
        });

        // Calculate total expenses
        let totalExpenses = 0;
        spenderTotals.forEach(({ amount }) => {
            totalExpenses += amount;
        });

        // Build the result
        const spenders: SpenderStats[] = [];
        let unassignedAmount = 0;
        let unassignedCount = 0;

        spenderTotals.forEach((data, spenderKey) => {
            if (spenderKey === null) {
                unassignedAmount = data.amount;
                unassignedCount = data.count;
            } else {
                const config = spenderConfig?.find(c => c.spender_key === spenderKey);
                spenders.push({
                    spender_key: spenderKey,
                    display_name: config?.display_name || spenderKey,
                    color: config?.color || '#6B7280',
                    total_amount: data.amount,
                    transaction_count: data.count,
                    percentage: totalExpenses > 0 ? Math.round((data.amount / totalExpenses) * 100) : 0
                });
            }
        });

        // Sort by amount descending
        spenders.sort((a, b) => b.total_amount - a.total_amount);

        return {
            spenders,
            total_expenses: totalExpenses,
            unassigned: {
                amount: unassignedAmount,
                count: unassignedCount,
                percentage: totalExpenses > 0 ? Math.round((unassignedAmount / totalExpenses) * 100) : 0
            }
        };
    });
}
