'use server';

import { createClient } from '@/lib/auth/server';

export interface MerchantMemoryInfo {
    isMemorized: boolean;
    currentCategory?: string;
    merchantNormalized?: string;
}

/**
 * Check if a merchant is already in the household's memory
 * Used to determine which dialog to show when user changes category
 */
export async function checkMerchantMemory(merchantNormalized: string): Promise<MerchantMemoryInfo> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { isMemorized: false };
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { isMemorized: false };
    }

    // Check for exact match first
    const { data: exactMatch } = await supabase
        .from('merchant_memory')
        .select('merchant_normalized, category')
        .eq('household_id', profile.household_id)
        .eq('merchant_normalized', merchantNormalized)
        .single();

    if (exactMatch) {
        return {
            isMemorized: true,
            currentCategory: exactMatch.category,
            merchantNormalized: exactMatch.merchant_normalized
        };
    }

    // Check for fuzzy match (merchant contains or is contained by memory entry)
    const { data: allMemory } = await supabase
        .from('merchant_memory')
        .select('merchant_normalized, category')
        .eq('household_id', profile.household_id);

    if (allMemory) {
        const lowerMerchant = merchantNormalized.toLowerCase();
        for (const m of allMemory) {
            const lowerMemory = m.merchant_normalized.toLowerCase();
            if (lowerMerchant.includes(lowerMemory) || lowerMemory.includes(lowerMerchant)) {
                return {
                    isMemorized: true,
                    currentCategory: m.category,
                    merchantNormalized: m.merchant_normalized
                };
            }
        }
    }

    return { isMemorized: false };
}

/**
 * Save or update merchant memory
 */
export async function saveMerchantMemory(
    merchantNormalized: string,
    category: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Not authenticated' };
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household found' };
    }

    const { error } = await supabase
        .from('merchant_memory')
        .upsert({
            household_id: profile.household_id,
            merchant_normalized: merchantNormalized,
            category: category,
            last_used: new Date().toISOString(),
            confidence_score: 100
        }, { onConflict: 'household_id, merchant_normalized' });

    if (error) {
        console.error('Failed to save merchant memory:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}

/**
 * Delete merchant from memory (forget the association)
 */
export async function deleteMerchantMemory(
    merchantNormalized: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Not authenticated' };
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household found' };
    }

    const { error } = await supabase
        .from('merchant_memory')
        .delete()
        .eq('household_id', profile.household_id)
        .eq('merchant_normalized', merchantNormalized);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}
