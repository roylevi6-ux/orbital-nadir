'use server';

import { createClient } from '@/lib/auth/server';
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from 'date-fns';
import { getAccounts } from './accounts';

export type DashboardStats = {
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    netWorth: number;
    transactionCount: number;
    monthName: string;
    currency: string;
};

export type ChartDataPoint = {
    date: string; // "Jan 24"
    income: number;
    expense: number;
};

export type RecentTransaction = {
    id: string;
    date: string;
    merchant: string;
    amount: number;
    type: 'income' | 'expense';
    category: string | null;
};

export type TopCategory = {
    name: string;
    amount: number;
    percentage: number; // % of total expenses
    change?: number; // % Change vs Previous Period
};

export type TopExpense = {
    id: string;
    merchant: string;
    amount: number;
    date: string;
    category: string;
};

export type TopMerchant = {
    name: string;
    amount: number;
    category: string;
};

export type DashboardData = {
    stats: DashboardStats;
    chartData: ChartDataPoint[];
    recentTransactions: RecentTransaction[];
    topCategories: TopCategory[];
    topExpenses: TopExpense[];
    topMerchants: TopMerchant[];
};

export async function getDashboardData(from?: string, to?: string): Promise<DashboardData> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) throw new Error('No household found');
    const householdId = profile.household_id;

    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', householdId)
        .order('date', { ascending: false });

    if (error) throw new Error('Failed to fetch transactions');

    const allTx = transactions || [];

    // --- Time Window Logic ---
    // Default: Last Month
    const now = new Date();
    const defaultDate = subMonths(now, 1);

    // Use params or default
    const startDate = from ? parseISO(from) : startOfMonth(defaultDate);
    const endDate = to ? parseISO(to) : endOfMonth(defaultDate);
    const monthName = from && to ? `${format(startDate, 'MMM yyyy')} - ${format(endDate, 'MMM yyyy')}` : format(startDate, 'MMMM yyyy');

    let totalExpenses = 0;
    let totalIncome = 0;

    // Filtered lists
    const rangeTx = allTx.filter(t => {
        const d = parseISO(t.date);
        return d >= startDate && d <= endDate;
    });

    // 1. Stats (Range filtered)
    rangeTx.forEach(t => {
        const amt = Math.abs(Number(t.amount)); // Treat as absolute magnitude
        if (t.type === 'expense') totalExpenses += amt;
        else if (t.type === 'income') totalIncome += amt;
    });
    const balance = totalIncome - totalExpenses;

    // 2. Chart Data (Trailing 6 Months from EndDate)
    const chartMap = new Map<string, { income: number, expense: number, dateObj: Date }>();
    for (let i = 5; i >= 0; i--) {
        const d = subMonths(endDate, i);
        const key = format(d, 'yyyy-MM');
        chartMap.set(key, { income: 0, expense: 0, dateObj: d });
    }

    // Populate Chart (Iterate all tx, but check 6 month window)
    const sixMonthsStart = subMonths(endDate, 5); // 0 to 5 = 6 months
    const sixMonthsEnd = endDate;

    allTx.forEach(t => {
        const d = parseISO(t.date);

        // Chart Populate
        const rangeStart = startOfMonth(sixMonthsStart);
        if (d >= rangeStart && d <= sixMonthsEnd) {
            const key = format(d, 'yyyy-MM');
            if (chartMap.has(key)) {
                const entry = chartMap.get(key)!;
                if (t.type === 'expense') entry.expense += Math.abs(Number(t.amount));
                else if (t.type === 'income') entry.income += Math.abs(Number(t.amount));
            }
        }
    });

    const chartData = Array.from(chartMap.values()).map(v => ({
        date: format(v.dateObj, 'MMM'),
        income: v.income,
        expense: v.expense
    }));

    // 3. Top Categories (Range filtered)
    const categoryMap = new Map<string, number>();
    rangeTx.filter(t => t.type === 'expense').forEach(t => {
        const cat = t.category || 'Uncategorized';
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + Math.abs(Number(t.amount)));
    });

    // Calculate Previous Period for MoM Change
    const rangeDuration = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - rangeDuration);
    const prevEnd = new Date(endDate.getTime() - rangeDuration);

    const prevCategoryMap = new Map<string, number>();
    allTx.filter(t => {
        const d = parseISO(t.date);
        return d >= prevStart && d < startDate && t.type === 'expense';
    }).forEach(t => {
        const cat = t.category || 'Uncategorized';
        prevCategoryMap.set(cat, (prevCategoryMap.get(cat) || 0) + Math.abs(Number(t.amount)));
    });

    const topCategories = Array.from(categoryMap.entries())
        .map(([name, amount]) => {
            const prevAmount = prevCategoryMap.get(name) || 0;
            let change = 0;
            if (prevAmount > 0) {
                change = ((amount - prevAmount) / prevAmount) * 100;
            } else if (amount > 0 && prevAmount === 0) {
                change = 100;
            }

            return {
                name,
                amount,
                percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
                change: Math.round(change)
            };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    // 4. Top Expenses (Range filtered)
    const topExpenses = rangeTx
        .filter(t => t.type === 'expense')
        .map(t => ({
            id: t.id,
            merchant: t.merchant_normalized || t.merchant_raw,
            amount: Number(t.amount), // Standard list view usually expects raw magnitude if UI formats it, but here we can just pass raw.
            // Wait, UI formats it as currency. If negative, formatToCurrency usually handles it.
            // But let's check standard logic. If I pass -700, UI shows -700. If I pass 700, UI shows 700.
            // Usually expenses list shows negatives. I will keep this raw.
            date: t.date,
            category: t.category || 'Uncategorized'
        }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) // Sort by magnitude
        .slice(0, 10);

    // 6. Top Merchants (Aggregated)
    const merchantMap = new Map<string, { amount: number, category: string }>();
    rangeTx.filter(t => t.type === 'expense').forEach(t => {
        const merch = t.merchant_normalized || t.merchant_raw;
        const cat = t.category || 'Uncategorized';
        // Use normalized names for aggregation
        const current = merchantMap.get(merch) || { amount: 0, category: cat };
        current.amount += Math.abs(Number(t.amount));
        if (current.category === 'Uncategorized' && cat !== 'Uncategorized') current.category = cat;
        merchantMap.set(merch, current);
    });

    const topMerchants = Array.from(merchantMap.entries())
        .map(([name, data]) => ({
            name,
            amount: data.amount,
            category: data.category
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20); // Top 20 merchants

    // 5. Recent (Range filtered)
    const recentTransactions = rangeTx.slice(0, 5).map(t => ({
        id: t.id,
        date: t.date,
        merchant: t.merchant_normalized || t.merchant_raw,
        amount: Number(t.amount),
        type: t.type as 'income' | 'expense',
        category: t.category
    }));

    // Net Worth (Always Live)
    let netWorth = 0;
    try {
        const { netWorthILS } = await getAccounts();
        netWorth = netWorthILS;
    } catch (e) {
        // console.error(e); 
    }

    return {
        stats: {
            totalExpenses,
            totalIncome,
            balance,
            netWorth,
            transactionCount: rangeTx.length,
            monthName,
            currency: 'ILS'
        },
        chartData,
        recentTransactions,
        topCategories,
        topExpenses,
        topMerchants
    };
}
