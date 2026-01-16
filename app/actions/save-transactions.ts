'use server';

import { createClient, createAdminClient } from '@/lib/auth/server';
import { ParsedTransaction } from '@/lib/parsing/types';

export async function saveTransactions(transactions: ParsedTransaction[], sourceType?: string) {
    const supabase = await createClient();

    // 1. Authenticate User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error('User not authenticated');
    }

    // 2. Get household_id with self-healing
    let { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    let householdId = profile?.household_id;

    if (!householdId) {
        console.log(`User ${user.id} has no profile. Attempting self-heal via Admin...`);

        const adminDb = createAdminClient();

        // 1. Create Household
        const { data: household, error: hhError } = await adminDb
            .from('households')
            .insert({ name: (user.email || 'User') + "'s Household" })
            .select('id')
            .single();

        if (hhError || !household) {
            console.error('Self-heal household creation failed:', hhError);
            throw new Error('Failed to create household: ' + hhError?.message);
        }

        // 2. Create User Profile
        const { error: profError } = await adminDb
            .from('user_profiles')
            .insert({
                id: user.id,
                household_id: household.id,
                preferences: {}
            });

        if (profError) {
            console.error('Self-heal profile creation failed:', profError);
            // Rollback household? Ideally. But for now just error.
            throw new Error('Failed to create user profile: ' + profError.message);
        }

        householdId = household.id;
    }

    // Transform to DB format
    const dbTransactions = transactions.map(t => ({
        household_id: householdId,
        date: t.date, // Assumes YYYY-MM-DD or valid ISO
        merchant_raw: t.merchant_raw,
        merchant_normalized: t.merchant_normalized || null, // Will be filled by AI later
        amount: t.amount,
        currency: t.currency || 'ILS',
        type: t.type,
        is_reimbursement: t.is_reimbursement || false,
        is_installment: t.is_installment || false,
        installment_info: t.installment_info || null,
        // Mark screenshots as BIT/Paybox for AI/system understanding
        source: sourceType === 'screenshot' ? 'BIT/Paybox Screenshot' : 'upload',
        status: 'verified' // Auto-verify since user reviewed before saving
    }));

    const { error } = await supabase
        .from('transactions')
        .insert(dbTransactions);

    if (error) {
        console.error('Save error:', error);
        throw new Error('Failed to save transactions: ' + error.message);
    }

    return { success: true, count: dbTransactions.length };
}
