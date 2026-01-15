'use server';

import { createClient } from '@/lib/auth/server';

export async function categorizeTransactions() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Not authenticated');

    // Get household
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) throw new Error('No household');
    const householdId = profile.household_id;

    // 1. Fetch all Categories
    const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('*');

    if (catError || !categories) throw new Error('Failed to fetch categories');

    // 2. Fetch Uncategorized Transactions
    const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id, merchant_raw')
        .eq('household_id', householdId)
        .is('category', null);

    if (txError || !transactions) throw new Error('Failed to fetch transactions');

    let updatedCount = 0;
    const updates = [];

    // 3. Match Logic
    for (const tx of transactions) {
        if (!tx.merchant_raw) continue;
        const merchant = tx.merchant_raw.toLowerCase();

        for (const cat of categories) {
            if (cat.keywords && Array.isArray(cat.keywords)) {
                // Check if any keyword matches
                const match = cat.keywords.some((k: string) => merchant.includes(k.toLowerCase()));
                if (match) {
                    updates.push({ id: tx.id, category: cat.name });
                    break; // Stop after first match
                }
            }
        }
    }

    // 4. Update Database
    if (updates.length > 0) {
        // We act in batches of 50 to avoid connection limits if many
        const batchSize = 50;

        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);

            // Parallel updates within batch
            await Promise.all(batch.map(update =>
                supabase
                    .from('transactions')
                    .update({ category: update.category })
                    .eq('id', update.id)
            ));

            updatedCount += batch.length;
        }
    }

    return { count: updatedCount };
}
