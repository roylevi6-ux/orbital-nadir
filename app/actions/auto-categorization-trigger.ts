'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';
import { logger } from '@/lib/logger';

/**
 * Trigger types for auto-categorization decisions
 */
export type AutoCatTrigger =
    | 'sms_created'        // SMS just created a provisional transaction
    | 'email_enriched'     // Email receipt enriched an existing transaction
    | 'cc_created'         // CC slip created a new transaction (no SMS match)
    | 'cc_confirmed'       // CC slip confirmed an existing SMS transaction
    | 'bit_standalone';    // User confirmed BIT as standalone transaction

export type CategorySource = 'auto' | 'user_manual' | 'rule';

export interface AutoCatContext {
    transactionId: string;
    trigger: AutoCatTrigger;
    currentCategory: string | null;
    categorySource: CategorySource | null;
    newMerchantInfo?: string;
    previousMerchant?: string;
}

export interface AutoCatDecision {
    shouldRun: boolean;
    reason: string;
}

/**
 * Determine if auto-categorization should run based on context
 *
 * Rules:
 * 1. User manually set category = NEVER override
 * 2. CC confirming SMS = preserve SMS category
 * 3. New transaction = always run
 * 4. Email enrichment = only if better merchant info AND auto-cat was source
 */
export function shouldRunAutoCategorization(ctx: AutoCatContext): AutoCatDecision {
    const { trigger, currentCategory, categorySource, newMerchantInfo, previousMerchant } = ctx;

    // Rule 1: User manually set category = NEVER override
    if (categorySource === 'user_manual') {
        return {
            shouldRun: false,
            reason: 'User manually categorized - preserving user choice'
        };
    }

    // Rule 2: CC confirming SMS = preserve SMS category
    if (trigger === 'cc_confirmed') {
        return {
            shouldRun: false,
            reason: 'CC slip confirmed SMS - preserving existing category'
        };
    }

    // Rule 3: New transaction = always run
    if (trigger === 'sms_created' || trigger === 'cc_created' || trigger === 'bit_standalone') {
        return {
            shouldRun: true,
            reason: `New transaction from ${trigger} - needs categorization`
        };
    }

    // Rule 4: Email enrichment = only if better merchant info
    if (trigger === 'email_enriched') {
        // No new merchant info provided
        if (!newMerchantInfo) {
            return {
                shouldRun: false,
                reason: 'Email enrichment but no new merchant info'
            };
        }

        // Already has a category from auto-cat - check if new info is better
        if (currentCategory && categorySource === 'auto') {
            const current = previousMerchant || '';
            const newInfo = newMerchantInfo;

            // "Better" = longer name, or has Hebrew when current doesn't
            const currentHasHebrew = /[א-ת]/.test(current);
            const newHasHebrew = /[א-ת]/.test(newInfo);

            const isBetter = (
                newInfo.length > current.length ||
                (newHasHebrew && !currentHasHebrew)
            );

            if (isBetter) {
                return {
                    shouldRun: true,
                    reason: 'Email has better merchant info - re-running auto-cat'
                };
            }
        }

        // No category yet and email has merchant info
        if (!currentCategory && newMerchantInfo) {
            return {
                shouldRun: true,
                reason: 'No category yet and email provides merchant info'
            };
        }

        return {
            shouldRun: false,
            reason: 'Email enrichment but existing info is sufficient'
        };
    }

    // Default: don't run
    return {
        shouldRun: false,
        reason: 'No trigger condition met'
    };
}

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
