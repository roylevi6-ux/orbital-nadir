'use server';

import { createClient } from '@/lib/auth/server';

export interface DuplicateGroup {
    key: string;
    transactions: TransactionPreview[];
}

export interface TransactionPreview {
    id: string;
    date: string;
    amount: number;
    merchant_raw: string;
    merchant_normalized?: string;
    category?: string;
    notes?: string;
    type: string;
    status: string;
    created_at: string;
}

// Assuming TransactionType is a string literal type based on common values
export type TransactionType = 'expense' | 'income' | 'transfer';

/**
 * 1. Find potential duplicates (Same Date, Same ABS Amount)
 * Ignores Merchant Name entirely.
 */
export async function getDuplicateGroups(): Promise<DuplicateGroup[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) throw new Error('No household');

    // Fetch all transactions
    const { data: allTransactions, error } = await supabase
        .from('transactions')
        .select('id, date, amount, merchant_raw, merchant_normalized, category, notes, type, status, created_at')
        .eq('household_id', profile.household_id)
        .order('date', { ascending: false }) // Sort by date to make windowing easy
        .order('created_at', { ascending: true });

    if (error || !allTransactions) {
        console.error('Fetch error:', error);
        throw new Error('Failed to fetch transactions');
    }

    const groups: TransactionPreview[][] = [];
    const visited = new Set<string>();

    console.log(`[DuplicateScanner] Scanning ${allTransactions.length} transactions...`);

    // O(N*W) Windowed Comparison
    // Since we sorted by Date, we only need to compare against recent neighbors
    for (let i = 0; i < allTransactions.length; i++) {
        const t1 = allTransactions[i];
        if (visited.has(t1.id)) continue;

        const currentGroup = [t1];

        // Look ahead
        for (let j = i + 1; j < allTransactions.length; j++) {
            const t2 = allTransactions[j];
            if (visited.has(t2.id)) continue;

            const t1Date = new Date(t1.date).getTime();
            const t2Date = new Date(t2.date).getTime();

            if (isNaN(t1Date) || isNaN(t2Date)) continue;

            const diffTime = Math.abs(t1Date - t2Date);
            const diffDays = diffTime / (1000 * 60 * 60 * 24);

            // Optimization: Since sorted by date (descending), if we exceed 3 days, we can stop looking for this t1.
            if (diffDays > 3) {
                break;
            }

            // CRITERIA: ABS Amount Match with 1.0 tolerance
            const amount1 = Math.abs(t1.amount);
            const amount2 = Math.abs(t2.amount);

            const amountDiff = Math.abs(amount1 - amount2);

            // Log specifically for the 120 case to debug
            if (Math.abs(amount1 - 120) < 1) {
                console.log(`[Compare] ${t1.merchant_raw} (${t1.amount}) vs ${t2.merchant_raw} (${t2.amount}) | Days: ${diffDays.toFixed(1)} | AmtDiff: ${amountDiff}`);
            }

            if (amountDiff <= 1.0) {
                console.log(`>>> MATCH FOUND: ${t1.id} & ${t2.id}`);
                currentGroup.push(t2);
                visited.add(t2.id);
            }
        }

        if (currentGroup.length > 1) {
            groups.push(currentGroup);
            visited.add(t1.id); // Mark primary as visited
        }
    }

    console.log(`[DuplicateScanner] Found ${groups.length} groups.`);

    // Transform to return format
    return groups.map((txs, idx) => ({
        key: `group-${idx}`, // Key is arbitrary now
        transactions: txs
    }));
}

/**
 * 2. Smart Merge a specific group
 */
export async function mergeTransactionGroup(primaryId: string, duplicateIds: string[], finalCategory?: string, finalType?: string, notes?: string) {
    const supabase = await createClient();

    // Fetch fresh data to be safe
    const { data: transactions, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .in('id', [primaryId, ...duplicateIds]);

    if (fetchError || !transactions || transactions.length === 0) {
        throw new Error('Failed to fetch transactions for merge');
    }

    // Identify primary (the one we keep)
    const primary = transactions.find(t => t.id === primaryId);
    if (!primary) throw new Error('Primary transaction not found');

    const others = transactions.filter(t => t.id !== primaryId);

    // --- Smart Merge Logic ---

    // 1. Notes: Use provided notes, or concatenate unique, non-empty notes
    let mergedNotes = notes;
    if (mergedNotes === undefined) {
        const uniqueNotes = new Set<string>();
        if (primary.notes) uniqueNotes.add(primary.notes);
        others.forEach(t => {
            if (t.notes) uniqueNotes.add(t.notes);
        });
        mergedNotes = Array.from(uniqueNotes).join(' | ');
    }

    // 2. Category: Prefer Override, then Primary, then Duplicates
    let mergedCategory = finalCategory; // Use override if present
    if (!mergedCategory) {
        mergedCategory = primary.category;
        if (!mergedCategory) {
            const found = others.find(t => t.category);
            if (found) mergedCategory = found.category;
        }
    }

    // 3. Merchant Normalized: Prefer primary, else take first valid
    let mergedMerchant = primary.merchant_normalized;
    if (!mergedMerchant) {
        const found = others.find(t => t.merchant_normalized);
        if (found) mergedMerchant = found.merchant_normalized;
    }

    // 4. Status: If ANY is verified, result is verified
    let mergedStatus = primary.status;
    if (mergedStatus !== 'verified') {
        const isAnyVerified = others.some(t => t.status === 'verified');
        if (isAnyVerified) mergedStatus = 'verified';
    }

    // 5. Type Override
    const mergedType = finalType || primary.type;

    // --- Execute Updates ---

    // Update Primary
    const { error: updateError } = await supabase
        .from('transactions')
        .update({
            notes: mergedNotes || null,
            category: mergedCategory,
            merchant_normalized: mergedMerchant,
            status: mergedStatus,
            type: mergedType
        })
        .eq('id', primaryId);

    if (updateError) throw new Error('Failed to update primary transaction');

    // Delete Duplicates
    const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .in('id', duplicateIds);

    if (deleteError) throw new Error('Failed to delete duplicates');

    return { success: true };
}
