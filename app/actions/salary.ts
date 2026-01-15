'use server';

import { createClient } from '@/lib/auth/server';
import { startOfMonth, endOfMonth } from 'date-fns';

export type SalaryEntry = {
    id: string;
    amount: number;
    date: string;
};

export type SalaryStatus = {
    total: number;
    entries: SalaryEntry[];
};

export async function getSalaryStatus(date: Date = new Date()): Promise<SalaryStatus> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { total: 0, entries: [] };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { total: 0, entries: [] };

    const start = startOfMonth(date).toISOString();
    const end = endOfMonth(date).toISOString();

    const { data: transactions } = await supabase
        .from('transactions')
        .select('id, amount, date')
        .eq('household_id', profile.household_id)
        .gte('date', start)
        .lte('date', end)
        .eq('type', 'income')
        .or('category.eq.Salary,category.eq.משכורת')
        .order('created_at', { ascending: true });

    if (!transactions || transactions.length === 0) {
        return { total: 0, entries: [] };
    }

    const total = transactions.reduce((sum, t) => sum + t.amount, 0);

    return {
        total,
        entries: transactions.map(t => ({
            id: t.id,
            amount: t.amount,
            date: t.date
        }))
    };
}

export async function addSalary(amount: number, date: Date = new Date()): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'User not authenticated' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) return { success: false, error: 'No household found' };

    const { error } = await supabase.from('transactions').insert({
        household_id: profile.household_id,
        date: date.toISOString().split('T')[0], // YYYY-MM-DD
        merchant_raw: 'Manual Salary Entry',
        merchant_normalized: 'Salary',
        amount: Math.abs(amount),
        currency: 'ILS',
        category: 'Salary', // English key to match Category List
        type: 'income',
        status: 'verified', // It's manual, so verified
        is_recurring: true, // Salaries are typically recurring
        source: 'manual'
    });

    if (error) {
        console.error('Error adding salary:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}

export async function removeSalary(transactionId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

