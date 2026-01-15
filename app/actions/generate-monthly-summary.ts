'use server';

import { createClient } from '@/lib/auth/server';
import { generateAIResponse } from '@/lib/ai/gemini-client';
import { analyzeTrends } from './analyze-trends';
import { detectAnomalies } from './detect-anomalies';
import { getMerchantIntelligence } from './merchant-intelligence';

export interface MonthlySummaryResult {
    success: boolean;
    summary?: string;
    error?: string;
}

export async function generateMonthlySummary(): Promise<MonthlySummaryResult> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return { success: false, error: 'User not authenticated' };

        // 1. Gather Data from all engines
        const [trendsRes, anomaliesRes, merchantsRes] = await Promise.all([
            analyzeTrends(),
            detectAnomalies(),
            getMerchantIntelligence()
        ]);

        // Fetch basic stats (Income/Expense/Balance)
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('household_id')
            .eq('id', user.id)
            .single();

        const householdId = profile?.household_id;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const { data: currentMonthTx } = await supabase
            .from('transactions')
            .select('*')
            .eq('household_id', householdId)
            .gte('date', startOfMonth)
            .lte('date', endOfMonth);

        const expenses = currentMonthTx?.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const income = currentMonthTx?.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        const balance = income - expenses;

        // 2. Construct Prompt for Narrative Generation
        const prompt = `
You are a financial analyst generating a monthly summary for a household.
Date: ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}

**Financial Data:**
- Total Expenses: ₪${expenses.toFixed(0)}
- Total Income: ₪${income.toFixed(0)}
- Net Balance: ₪${balance.toFixed(0)}

**Trends:**
${trendsRes.success ? trendsRes.trends?.slice(0, 3).map(t => `- ${t.category}: ₪${t.currentAmount.toFixed(0)} (${t.percentChangeVsPrev > 0 ? '+' : ''}${t.percentChangeVsPrev.toFixed(1)}% vs prev)`).join('\n') : 'No trend data'}

**Anomalies Detected:**
${anomaliesRes.success ? anomaliesRes.anomalies?.map(a => `- ${a.description} (₪${a.amount})`).join('\n') : 'None'}

**Top Merchants:**
${merchantsRes.success ? merchantsRes.topMerchants?.slice(0, 3).map(m => `- ${m.merchant}: ₪${m.totalAmount.toFixed(0)}`).join('\n') : 'No merchant data'}

**Instructions:**
Generate a concise monthly summary in Hebrew following this specific structure:
1. **Header**: "📊 סיכום חודשי — [Month Year]"
2. **Stats**: Income, Expenses, Balance
3. **Key Insights**: Bullet points covering major trends (increases/decreases) and anomalies.
4. **Conclusion**: One sentence summary of financial health.

Use emojis. Format numbers with ₪. Keep it professional but accessible.
`;

        const summaryResponse = await generateAIResponse(prompt);

        return {
            success: true,
            summary: summaryResponse
        };

    } catch (error) {
        console.error('Monthly Summary Error:', error);
        return { success: false, error: 'Failed to generate summary' };
    }
}
