'use server';

import { createClient } from '@/lib/auth/server';

export interface MonthlyReportData {
    month: number;
    year: number;
    monthName: string;
    transactions: Array<{
        date: string;
        merchant_normalized?: string | null;
        merchant_raw?: string | null;
        category?: string | null;
        amount: number;
        currency?: string;
        type: string;
    }>;
    summary: {
        totalIncome: number;
        totalExpenses: number;
        netBalance: number;
        currency: string;
        transactionCount: number;
    };
    categoryBreakdown: Array<{
        category: string;
        amount: number;
        percentage: number;
    }>;
}

export async function getMonthlyReportData(
    year: number,
    month: number
): Promise<{ success: boolean; data?: MonthlyReportData; error?: string }> {
    const supabase = await createClient();

    // 1. Authenticate User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'User not authenticated' };
    }

    // 2. Get household_id
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household found' };
    }

    // 3. Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // 4. Fetch transactions for the month (only verified for accurate reporting)
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', profile.household_id)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .in('status', ['categorized', 'verified'])
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching monthly transactions:', error);
        return { success: false, error: error.message };
    }

    if (!transactions || transactions.length === 0) {
        return {
            success: false,
            error: 'No verified transactions found for this month'
        };
    }

    // 5. Calculate summary
    const income = transactions.filter(t => t.type === 'income');
    const expenses = transactions.filter(t => t.type === 'expense');

    const totalIncome = income.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
    const netBalance = totalIncome - totalExpenses;

    // 6. Category breakdown (expenses only)
    const categoryTotals: { [key: string]: number } = {};
    expenses.forEach(tx => {
        const category = tx.category || 'Uncategorized';
        categoryTotals[category] = (categoryTotals[category] || 0) + Number(tx.amount);
    });

    const categoryBreakdown = Object.entries(categoryTotals)
        .map(([category, amount]) => ({
            category,
            amount,
            percentage: (amount / totalExpenses) * 100
        }))
        .sort((a, b) => b.amount - a.amount);

    // 7. Month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];

    // 8. Return report data
    return {
        success: true,
        data: {
            month,
            year,
            monthName,
            transactions: transactions.map(tx => ({
                date: tx.date,
                merchant_normalized: tx.merchant_normalized,
                merchant_raw: tx.merchant_raw,
                category: tx.category,
                amount: Number(tx.amount),
                currency: tx.currency,
                type: tx.type
            })),
            summary: {
                totalIncome,
                totalExpenses,
                netBalance,
                currency: transactions[0]?.currency || 'ILS',
                transactionCount: transactions.length
            },
            categoryBreakdown
        }
    };
}
