'use server';

import { withAuthAutoProvision, ActionResult } from '@/lib/auth/context';
import { ParsedTransaction } from '@/lib/parsing/types';

export async function saveTransactions(
    transactions: ParsedTransaction[],
    sourceType?: string
): Promise<ActionResult<{ count: number }>> {
    return withAuthAutoProvision(async ({ supabase, householdId }) => {
        // Transform to DB format
        const dbTransactions = transactions.map(t => ({
            household_id: householdId,
            date: t.date,
            merchant_raw: t.merchant_raw,
            merchant_normalized: t.merchant_normalized || null,
            amount: t.amount,
            currency: t.currency || 'ILS',
            type: t.type,
            is_reimbursement: t.is_reimbursement || false,
            is_installment: t.is_installment || false,
            installment_info: t.installment_info || null,
            source: sourceType === 'screenshot' ? 'BIT/Paybox Screenshot' : 'upload',
            status: 'pending'
        }));

        const { error } = await supabase
            .from('transactions')
            .insert(dbTransactions);

        if (error) {
            throw new Error('Failed to save transactions: ' + error.message);
        }

        return { count: dbTransactions.length };
    });
}
