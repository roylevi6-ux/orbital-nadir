'use server';

import { createClient } from '@/lib/auth/server';
import { revalidatePath } from 'next/cache';

type BulkUpdateItem = {
    id: string;
    merchant_normalized?: string | null;
};

export async function bulkUpdateCategories(items: BulkUpdateItem[], category: string | null, status: 'categorized' | 'skipped' = 'categorized') {
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

    const ids = items.map(i => i.id);

    // 2. Update Transactions
    // We can't easily update merchant_normalized per row in a single update if they differ.
    // But usually bulk update is for SAME merchant group or just confirming existing norms.
    // For now, we just update category and status.
    // If we need to update merchant_normalized, we might need a loop or specific logic.
    // Let's assume for bulk "Apply to all", we are just setting the category.
    const updatePayload: any = { status };
    if (category !== null) updatePayload.category = category;

    const { error } = await supabase
        .from('transactions')
        .update(updatePayload)
        .in('id', ids)
        .eq('household_id', profile.household_id);

    if (error) throw new Error(error.message);

    // 3. Learn! (Update Merchant Memory)
    // unique merchants in this batch
    const uniqueMerchants = Array.from(new Set(items.map(i => i.merchant_normalized).filter(Boolean)));

    if (uniqueMerchants.length > 0) {
        const memoryUpdates = uniqueMerchants.map(merchant => ({
            household_id: profile.household_id,
            merchant_normalized: merchant,
            category: category,
            last_used: new Date().toISOString(),
            confidence_score: 100
        }));

        const { error: memoryError } = await supabase
            .from('merchant_memory')
            .upsert(memoryUpdates as any, { onConflict: 'household_id, merchant_normalized' });

        if (memoryError) console.error('Failed to learn merchant:', memoryError);
    }

    revalidatePath('/dashboard');
    revalidatePath('/transactions');
    revalidatePath('/review');

    return { success: true, count: ids.length };
}
