'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';

const RECEIPT_EMAIL_DOMAIN = process.env.RECEIPT_EMAIL_DOMAIN || 'orbitalnadirfinance.org';

/**
 * Get the unique receipt forwarding email address for the current user's household.
 * Format: receipts+{token}@{domain}
 */
export async function getReceiptForwardingEmail(): Promise<ActionResult<{ email: string; token: string }>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('households')
            .select('receipt_token')
            .eq('id', householdId)
            .single();

        if (error) {
            throw new Error('Failed to fetch household: ' + error.message);
        }

        if (!data?.receipt_token) {
            throw new Error('No receipt token found for household');
        }

        const email = `receipts+${data.receipt_token}@${RECEIPT_EMAIL_DOMAIN}`;

        return {
            email,
            token: data.receipt_token
        };
    });
}
