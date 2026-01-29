'use server';

import { createClient } from '@/lib/auth/server';

interface CreateTransactionData {
    date: string;
    merchant_raw: string;
    amount: number;
    currency: string;
    type: 'income' | 'expense';
    category?: string;
    notes?: string;
    is_reimbursement?: boolean;
}

export async function createTransaction(data: CreateTransactionData): Promise<{ success: boolean; error?: string; transaction_id?: string }> {
    const supabase = await createClient();

    // 1. Authenticate User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'User not authenticated' };
    }

    // 2. Get household_id
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household found' };
    }

    // 3. Insert transaction
    // For reimbursements: store as expense with is_reimbursement=true
    // Amount is stored as positive but marked as reimbursement
    const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
            household_id: profile.household_id,
            date: data.date,
            merchant_raw: data.merchant_raw,
            merchant_normalized: data.merchant_raw, // Set same as raw for manual entries
            amount: data.amount,
            currency: data.currency,
            type: data.is_reimbursement ? 'expense' : data.type, // Reimbursements are stored as expenses
            category: data.category || null,
            notes: data.notes || null,
            source: 'manual', // Mark as manually created
            status: data.category ? 'categorized' : 'pending',
            is_installment: false,
            installment_info: null,
            is_reimbursement: data.is_reimbursement || false
        })
        .select('id')
        .single();

    if (error) {
        console.error('Create transaction error:', error);
        return { success: false, error: error.message };
    }

    return { success: true, transaction_id: transaction.id };
}
