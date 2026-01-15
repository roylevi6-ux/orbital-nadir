'use server';

import { createClient } from '@/lib/auth/server';
import { revalidatePath } from 'next/cache';

export async function updateTransactionCategory(transactionId: string, category: string | null, merchantNormalized?: string | null, status: 'categorized' | 'skipped' = 'categorized') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    // 1. Get Household ID
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) throw new Error('No household');

    // 2. Update Transaction
    const updatePayload: any = {
        status: status,
        ...(merchantNormalized ? { merchant_normalized: merchantNormalized } : {})
    };

    if (category !== null) {
        updatePayload.category = category;
    }

    const { error } = await supabase
        .from('transactions')
        .update(updatePayload)
        .eq('id', transactionId)
        .eq('household_id', profile.household_id);

    if (error) throw new Error(error.message);

    // 3. Learn! (Update Merchant Memory)
    if (merchantNormalized) {
        // Upsert memory
        // Check if exists first? Or just upsert?
        // Table 'merchant_memory' constraint is (household_id, merchant_normalized)

        const { error: memoryError } = await supabase
            .from('merchant_memory')
            .upsert({
                household_id: profile.household_id,
                merchant_normalized: merchantNormalized,
                category: category,
                last_used: new Date().toISOString(),
                confidence_score: 100 // User confirmed
            }, { onConflict: 'household_id, merchant_normalized' });

        if (memoryError) console.error('Failed to learn merchant:', memoryError);
    }

    revalidatePath('/dashboard');
    revalidatePath('/transactions');
    revalidatePath('/review');

    return { success: true };
}
