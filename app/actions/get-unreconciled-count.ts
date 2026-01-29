'use server';

import { getPendingReconciliationCount } from '@/app/actions/p2p-reconciliation';

export async function getUnreconciledCount() {
    // Get count of pending reconciliation items (matches + reimbursements)
    try {
        const counts = await getPendingReconciliationCount();
        return counts.matches + counts.reimbursements;
    } catch (error) {
        console.error('Error fetching unreconciled count:', error);
        return 0;
    }
}
