'use server';

import { createClient } from '@/lib/auth/server';

export interface CategoryTrend {
    category: string;
    currentAmount: number;
    previousAmount: number;
    averageAmount: number;
    percentChangeVsPrev: number;
    percentChangeVsAvg: number;
    isSignificantIncrease: boolean; // >20% increase
}

export interface TrendAnalysisResult {
    success: boolean;
    trends?: CategoryTrend[];
    monthOverMonthChange?: number; // Total spending change %
    error?: string;
}

export async function analyzeTrends(): Promise<TrendAnalysisResult> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return { success: false, error: 'User not authenticated' };

        // Get household_id
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('household_id')
            .eq('id', user.id)
            .single();

        if (!profile?.household_id) return { success: false, error: 'No household found' };

        const householdId = profile.household_id;

        // Date ranges
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Current Month Range
        const currentStart = new Date(currentYear, currentMonth, 1).toISOString();
        const currentEnd = new Date(currentYear, currentMonth + 1, 0).toISOString();

        // Previous Month Range
        const prevStart = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const prevEnd = new Date(currentYear, currentMonth, 0).toISOString();

        // 12 Months Ago (for average)
        const avgStart = new Date(currentYear, currentMonth - 12, 1).toISOString();
        const avgEnd = prevEnd; // Up to last month

        // Fetch Transactions
        const { data: transactions } = await supabase
            .from('transactions')
            .select('amount, date, category, type')
            .eq('household_id', householdId)
            .eq('type', 'expense')
            .gte('date', avgStart)
            .lte('date', currentEnd);

        if (!transactions) return { success: true, trends: [] };

        // Helper to sum amounts
        const sumAmount = (list: any[]) => list.reduce((sum, t) => sum + Number(t.amount), 0);

        // Group by category for Current Month
        const currentTx = transactions.filter(t => t.date >= currentStart && t.date <= currentEnd);
        const prevTx = transactions.filter(t => t.date >= prevStart && t.date <= prevEnd);
        const historyTx = transactions.filter(t => t.date >= avgStart && t.date <= avgEnd);

        const currentTotal = sumAmount(currentTx);
        const prevTotal = sumAmount(prevTx);
        const monthOverMonthChange = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;

        // Unique categories
        const categories = Array.from(new Set(transactions.map(t => t.category || 'Uncategorized')));

        const trends: CategoryTrend[] = categories.map(cat => {
            const catCurrent = sumAmount(currentTx.filter(t => (t.category || 'Uncategorized') === cat));
            const catPrev = sumAmount(prevTx.filter(t => (t.category || 'Uncategorized') === cat));

            // Calculate 12-month average (sum of history / 12)
            // Note: Simplification - dividing by 12, even if data is partial
            const catHistoryTotal = sumAmount(historyTx.filter(t => (t.category || 'Uncategorized') === cat));
            const catAvg = catHistoryTotal / 12;

            const changeVsPrev = catPrev > 0 ? ((catCurrent - catPrev) / catPrev) * 100 : 0;
            const changeVsAvg = catAvg > 0 ? ((catCurrent - catAvg) / catAvg) * 100 : 0;

            return {
                category: cat,
                currentAmount: catCurrent,
                previousAmount: catPrev,
                averageAmount: catAvg,
                percentChangeVsPrev: changeVsPrev,
                percentChangeVsAvg: changeVsAvg,
                isSignificantIncrease: changeVsPrev > 20 || changeVsAvg > 20 // Flag if > 20% increase
            };
        });

        // Sort by biggest increase vs previous
        trends.sort((a, b) => b.percentChangeVsPrev - a.percentChangeVsPrev);

        return {
            success: true,
            trends,
            monthOverMonthChange
        };

    } catch (error) {
        console.error('Trend Analysis Error:', error);
        return { success: false, error: 'Failed to analyze trends' };
    }
}
