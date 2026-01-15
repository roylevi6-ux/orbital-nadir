'use server';

import { findPotentialDuplicates } from '@/app/actions/reconcile-transactions';

export async function getUnreconciledCount() {
    // We want the badge to show exactly what the widget shows.
    // Instead of querying 'is_duplicate' status (which might be stale or used differently),
    // we run the same detection logic.

    // Check cache or run logic
    const { data, error } = await findPotentialDuplicates();

    if (error) {
        console.error('Error fetching unreconciled count:', error);
        // Fallback to 0 to avoid alarming user if logic fails
        return 0;
    }

    return data ? data.length : 0;
}
