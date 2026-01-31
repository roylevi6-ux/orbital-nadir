/**
 * Auto-categorization utility functions and types
 * These are client-safe utilities that don't require server actions
 */

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
