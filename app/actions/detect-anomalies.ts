'use server';

import { createClient } from '@/lib/auth/server';

export interface Anomaly {
    id: string; // transaction id or unique key
    type: 'unusual_transaction' | 'recurring_change' | 'category_spike';
    description: string;
    amount: number;
    severity: 'medium' | 'high';
    date: string;
}

export interface AnomalyDetectionResult {
    success: boolean;
    anomalies?: Anomaly[];
    error?: string;
}

export async function detectAnomalies(): Promise<AnomalyDetectionResult> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return { success: false, error: 'User not authenticated' };

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('household_id')
            .eq('id', user.id)
            .single();

        if (!profile?.household_id) return { success: false, error: 'No household found' };

        const householdId = profile.household_id;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        // Fetch current month transactions
        const { data: currentMonthTx } = await supabase
            .from('transactions')
            .select('*')
            .eq('household_id', householdId)
            .eq('type', 'expense')
            .gte('date', startOfMonth)
            .lte('date', endOfMonth);

        if (!currentMonthTx) return { success: true, anomalies: [] };

        const anomalies: Anomaly[] = [];

        // 1. Unusual Single Transactions
        // Rule: > ₪200 from merchant used < 3 times historically (Simplified: Check if > ₪1000 for now as "large" or logic needs history check)
        // Let's implement: Any transaction > 2x average for that merchant (requires history)
        // MVP Rule: Any single transaction > ₪1000 is flagged as "High Value"

        currentMonthTx.forEach(tx => {
            if (Number(tx.amount) > 1000) {
                anomalies.push({
                    id: tx.id,
                    type: 'unusual_transaction',
                    description: `Large transaction at ${tx.merchant_raw}`,
                    amount: Number(tx.amount),
                    severity: 'high',
                    date: tx.date
                });
            }
        });

        // 2. Category Spikes
        // Rule: Single transaction > 40% of monthly category total
        const categoryTotals: Record<string, number> = {};
        currentMonthTx.forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(tx.amount);
        });

        currentMonthTx.forEach(tx => {
            const cat = tx.category || 'Uncategorized';
            const total = categoryTotals[cat];
            if (total > 0 && (Number(tx.amount) / total) > 0.40 && Number(tx.amount) > 200) { // Add threshold to avoid noise
                anomalies.push({
                    id: tx.id + '_spike',
                    type: 'category_spike',
                    description: `Single ${tx.merchant_raw} purchase is ${((Number(tx.amount) / total) * 100).toFixed(0)}% of ${cat} spending`,
                    amount: Number(tx.amount),
                    severity: 'medium',
                    date: tx.date
                });
            }
        });

        // Deduplicate anomalies (if same tx triggers multiple rules, pick highest severity or merge)
        // Simple deduplication by ID
        const uniqueAnomalies = Array.from(new Map(anomalies.map(item => [item.id, item])).values());

        return {
            success: true,
            anomalies: uniqueAnomalies
        };

    } catch (error) {
        console.error('Anomaly Detection Error:', error);
        return { success: false, error: 'Failed to detect anomalies' };
    }
}
