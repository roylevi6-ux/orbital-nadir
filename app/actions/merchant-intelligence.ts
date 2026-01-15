'use server';

import { createClient } from '@/lib/auth/server';

export interface MerchantStats {
    merchant: string;
    totalAmount: number;
    count: number;
    averageAmount: number;
}

export interface MerchantIntelligenceResult {
    success: boolean;
    topMerchants?: MerchantStats[];
    error?: string;
}

export async function getMerchantIntelligence(): Promise<MerchantIntelligenceResult> {
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
        // const now = new Date();
        // const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        // const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        // Fetch ALL transactions for top merchant analysis
        const { data: allTx } = await supabase
            .from('transactions')
            .select('*')
            .eq('household_id', householdId)
            .eq('type', 'expense');
        // .gte('date', startOfMonth)
        // .lte('date', endOfMonth);

        if (!allTx) return { success: true, topMerchants: [] };

        const merchantMap: Record<string, MerchantStats> = {};

        allTx.forEach(tx => {
            const name = tx.merchant_normalized || tx.merchant_raw;
            if (!merchantMap[name]) {
                merchantMap[name] = { merchant: name, totalAmount: 0, count: 0, averageAmount: 0 };
            }
            merchantMap[name].totalAmount += Number(tx.amount);
            merchantMap[name].count += 1;
        });

        // Calculate averages
        Object.values(merchantMap).forEach(m => {
            m.averageAmount = m.totalAmount / m.count;
        });

        // Sort by total spend
        const topMerchants = Object.values(merchantMap)
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 5);

        return {
            success: true,
            topMerchants
        };

    } catch (error) {
        console.error('Merchant Intelligence Error:', error);
        return { success: false, error: 'Failed to fetch merchant data' };
    }
}
