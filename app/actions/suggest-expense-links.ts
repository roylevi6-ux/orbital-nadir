'use server';

import { createClient } from '@/lib/auth/server';
import { Transaction } from './get-transactions';

export interface ExpenseSuggestion {
    transaction: Transaction;
    daysAgo: number;
    amountMatch: 'exact' | 'partial';
}

export async function suggestExpenseLinks(
    receiveDate: string,
    amount: number
): Promise<{ success: boolean; suggestions?: ExpenseSuggestion[]; error?: string }> {
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

    // 3. Calculate date range (7-14 days before receive date)
    const receiveDateObj = new Date(receiveDate);
    const startDate = new Date(receiveDateObj);
    startDate.setDate(startDate.getDate() - 14);
    const endDate = new Date(receiveDateObj);
    endDate.setDate(endDate.getDate() - 1); // Up to day before

    // 4. Search for potential matching expenses
    const reimbursementLikelyCategories = [
        'בל"מ ומתנות',
        'טיולים וחופשות',
        'אוכל בחוץ',
        'מתנות',
        'Gifts & Unexpected',
        'Trips & Vacations',
        'Eating Out'
    ];

    const { data: expenses, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', profile.household_id)
        .eq('type', 'expense')
        .in('category', reimbursementLikelyCategories)
        .gte('amount', 200) // Minimum amount threshold
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching expense suggestions:', error);
        return { success: false, error: error.message };
    }

    if (!expenses || expenses.length === 0) {
        return { success: true, suggestions: [] };
    }

    // 5. Score and filter expenses
    const suggestions: ExpenseSuggestion[] = expenses.map(exp => {
        const expDate = new Date(exp.date);
        const daysDiff = Math.floor((receiveDateObj.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));

        const amountMatch: 'exact' | 'partial' =
            Math.abs(exp.amount - amount) < 1 ? 'exact' : 'partial';

        return {
            transaction: exp as Transaction,
            daysAgo: daysDiff,
            amountMatch
        };
    });

    // 6. Filter and sort by relevance
    const filteredSuggestions = suggestions
        .filter(s => s.daysAgo >= 0 && s.daysAgo <= 14)
        .sort((a, b) => {
            // Prioritize exact matches
            if (a.amountMatch === 'exact' && b.amountMatch !== 'exact') return -1;
            if (b.amountMatch === 'exact' && a.amountMatch !== 'exact') return 1;
            // Then sort by recency
            return a.daysAgo - b.daysAgo;
        })
        .slice(0, 3); // Top 3

    return { success: true, suggestions: filteredSuggestions };
}

export async function linkReimbursementToExpense(
    reimbursementId: string,
    expenseId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // 1. Authenticate User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'User not authenticated' };
    }

    // 2. Get household_id for security
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return { success: false, error: 'No household found' };
    }

    // 3. Update reimbursement transaction with link
    const { error } = await supabase
        .from('transactions')
        .update({ linked_to_transaction_id: expenseId })
        .eq('id', reimbursementId)
        .eq('household_id', profile.household_id);

    if (error) {
        console.error('Error linking reimbursement:', error);
        return { success: false, error: error.message };
    }

    return { success: true };
}
