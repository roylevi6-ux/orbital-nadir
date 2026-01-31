'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';
import { logger } from '@/lib/logger';
import { shouldRunAutoCategorization } from '@/lib/auto-cat-utils';
import type { AutoCatTrigger, CategorySource } from '@/lib/auto-cat-utils';

// Note: Types and sync utilities are exported from @/lib/auto-cat-utils
// Import directly from there for client-side usage

/**
 * Update the category source when a transaction is categorized
 */
export async function setCategorySource(
    transactionId: string,
    source: CategorySource
): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase }) => {
        const { error } = await supabase
            .from('transactions')
            .update({ category_source: source })
            .eq('id', transactionId);

        if (error) {
            logger.error('[AutoCat Trigger] Failed to set category source:', error);
            throw new Error('Failed to set category source');
        }

        logger.info('[AutoCat Trigger] Set category source:', { transactionId, source });
    });
}

/**
 * Mark a transaction as manually categorized (prevents auto-cat override)
 */
export async function markAsUserCategorized(
    transactionId: string,
    category: string
): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase }) => {
        const { error } = await supabase
            .from('transactions')
            .update({
                category,
                category_source: 'user_manual'
            })
            .eq('id', transactionId);

        if (error) {
            logger.error('[AutoCat Trigger] Failed to mark as user categorized:', error);
            throw new Error('Failed to mark as user categorized');
        }

        logger.info('[AutoCat Trigger] Marked as user categorized:', { transactionId, category });
    });
}

/**
 * Check if a transaction can be auto-categorized (not user-set)
 */
export async function canAutoCategorize(
    transactionId: string
): Promise<ActionResult<boolean>> {
    return withAuth(async ({ supabase }) => {
        const { data, error } = await supabase
            .from('transactions')
            .select('category_source')
            .eq('id', transactionId)
            .single();

        if (error) {
            logger.error('[AutoCat Trigger] Failed to check category source:', error);
            throw new Error('Failed to check category source');
        }

        // Can auto-categorize if source is not 'user_manual'
        return data?.category_source !== 'user_manual';
    });
}

/**
 * Get transactions that need categorization
 * (provisional or pending with no category)
 */
export async function getTransactionsNeedingCategorization(): Promise<ActionResult<string[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('transactions')
            .select('id')
            .eq('household_id', householdId)
            .in('status', ['provisional', 'pending'])
            .is('category', null);

        if (error) {
            logger.error('[AutoCat Trigger] Failed to get uncategorized transactions:', error);
            throw new Error('Failed to get uncategorized transactions');
        }

        return (data || []).map(t => t.id);
    });
}

/**
 * Trigger auto-categorization for a specific transaction
 * This is a helper that checks conditions and runs categorization if appropriate
 */
export async function triggerAutoCategorization(
    transactionId: string,
    trigger: AutoCatTrigger,
    newMerchantInfo?: string
): Promise<ActionResult<{ triggered: boolean; reason: string }>> {
    return withAuth(async ({ supabase }) => {
        // Get current transaction state
        const { data: tx, error } = await supabase
            .from('transactions')
            .select('category, category_source, merchant_normalized')
            .eq('id', transactionId)
            .single();

        if (error) {
            logger.error('[AutoCat Trigger] Failed to get transaction:', error);
            throw new Error('Failed to get transaction');
        }

        // Decide if we should run
        const decision = shouldRunAutoCategorization({
            transactionId,
            trigger,
            currentCategory: tx.category,
            categorySource: tx.category_source as CategorySource | null,
            newMerchantInfo,
            previousMerchant: tx.merchant_normalized
        });

        logger.info('[AutoCat Trigger] Decision:', {
            transactionId,
            trigger,
            decision
        });

        // Note: The actual categorization should be called by the caller
        // This function just determines if it should run
        return {
            triggered: decision.shouldRun,
            reason: decision.reason
        };
    });
}
