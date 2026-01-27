'use server';

import { createClient } from '@/lib/auth/server';
import { generateAIResponse } from '@/lib/ai/gemini-client';
import { analyzeTrends } from './analyze-trends';
import { detectAnomalies } from './detect-anomalies';
import { getMerchantIntelligence } from './merchant-intelligence';

export interface AIQueryResponse {
    success: boolean;
    answer?: string;
    error?: string;
}

export async function processAIQuery(userQuestion: string): Promise<AIQueryResponse> {
    try {
        // Sanitize user input - limit length and remove potential injection patterns
        const sanitizedQuestion = userQuestion
            .slice(0, 1000) // Limit question length
            .replace(/[<>]/g, ''); // Remove HTML-like characters

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: 'User not authenticated' };
        }

        // 1. Get Household ID
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('household_id')
            .eq('id', user.id)
            .single();

        if (!profile?.household_id) {
            return { success: false, error: 'No household found' };
        }

        // 2. Fetch Context Data from Engines
        const [trendsRes, anomaliesRes, merchantsRes] = await Promise.all([
            analyzeTrends(),
            detectAnomalies(),
            getMerchantIntelligence()
        ]);

        const now = new Date();
        // Fetch ALL time data (removed 6-month limit)
        // const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
        const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const { data: recentTransactions } = await supabase
            .from('transactions')
            .select('*')
            .eq('household_id', profile.household_id)
            // .gte('date', sixMonthsAgo) // Removed restriction
            .lte('date', endOfCurrentMonth);

        // Analyze the fetched data (aggregated by month)
        const monthlyStats: Record<string, { t: number, income: number, expense: number }> = {};

        recentTransactions?.forEach(t => {
            const m = t.date.substring(0, 7); // YYYY-MM
            if (!monthlyStats[m]) monthlyStats[m] = { t: 0, income: 0, expense: 0 };
            monthlyStats[m].t++;
            if (t.type === 'income') monthlyStats[m].income += Number(t.amount);
            else monthlyStats[m].expense += Number(t.amount);
        });

        // Current Month (for specific stats)
        const currentMonthKey = now.toISOString().substring(0, 7);
        const currentStats = monthlyStats[currentMonthKey] || { income: 0, expense: 0 };
        const expenses = currentStats.expense;
        const income = currentStats.income;
        const balance = income - expenses;

        // Get recent transactions (last 15)
        const { data: recentTx } = await supabase
            .from('transactions')
            .select('*')
            .eq('household_id', profile.household_id)
            .order('date', { ascending: false })
            .limit(15);

        // 3. Construct Prompt with Expanded Context
        const monthlySummaryText = Object.entries(monthlyStats)
            .sort((a, b) => b[0].localeCompare(a[0])) // Descending
            .map(([month, stats]) => `- ${month}: Income ₪${stats.income.toFixed(0)}, Exp ₪${stats.expense.toFixed(0)} (${stats.t} tx)`)
            .join('\n');

        // 3. Construct Prompt
        const prompt = `
You are a smart financial assistant for a household.
User Question: "${sanitizedQuestion}"

**Financial Snapshot (Current Month: ${now.toLocaleString('default', { month: 'long' })}):**
- Total Income: ₪${income.toFixed(0)}
- Total Expenses: ₪${expenses.toFixed(0)}
- Net Balance: ₪${balance.toFixed(0)}

**Historical Window (All Time):**
${monthlySummaryText}

**Spending Trends:**
${trendsRes.success ? trendsRes.trends?.slice(0, 5).map(t => `- ${t.category}: ₪${t.currentAmount.toFixed(0)} (${t.percentChangeVsPrev > 0 ? '+' : ''}${t.percentChangeVsPrev.toFixed(1)}% vs prev)`).join('\n') : 'No trend data'}

**Detected Anomalies:**
${anomaliesRes.success ? anomaliesRes.anomalies?.map(a => `- ${a.description} (₪${a.amount})`).join('\n') : 'None'}

**Top Merchants:**
${merchantsRes.success ? merchantsRes.topMerchants?.slice(0, 5).map(m => `- ${m.merchant}: ₪${m.totalAmount.toFixed(0)} (${m.count} tx)`).join('\n') : 'No merchant data'}

**Recent Transactions:**
${recentTx?.map(t => `- ${t.date}: ${t.merchant_raw} (${t.category}) - ₪${t.amount}`).join('\n')}

**Instructions:**
- Answer the user's question directly and concisely based *only* on the data provided.
- If the answer isn't in the data, explain what you know and what is missing.
- Use Hebrew if the question is in Hebrew (RTL friendly); otherwise use English.
- Format amounts with ₪.
- Be helpful and encouraging (but realistic about spending).
- Do not invent data.
`;

        // 4. Call Gemini
        const answer = await generateAIResponse(prompt);

        return {
            success: true,
            answer: answer.trim()
        };

    } catch (error) {
        console.error('AI Query Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: `AI Query failed: ${message}` };
    }
}
