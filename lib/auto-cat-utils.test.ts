import { describe, it, expect } from 'vitest';
import { shouldRunAutoCategorization, AutoCatContext } from './auto-cat-utils';

describe('Auto Categorization Utils', () => {
    const baseContext: AutoCatContext = {
        transactionId: '123',
        trigger: 'sms_created',
        currentCategory: null,
        categorySource: null,
    };

    it('should NOT run if user manually categorized', () => {
        const result = shouldRunAutoCategorization({
            ...baseContext,
            categorySource: 'user_manual',
        });
        expect(result.shouldRun).toBe(false);
        expect(result.reason).toContain('User manually categorized');
    });

    it('should NOT run if trigger is cc_confirmed', () => {
        const result = shouldRunAutoCategorization({
            ...baseContext,
            trigger: 'cc_confirmed',
        });
        expect(result.shouldRun).toBe(false);
        expect(result.reason).toContain('CC slip confirmed SMS');
    });

    it('should run for new transactions', () => {
        const triggers = ['sms_created', 'cc_created', 'bit_standalone'] as const;
        triggers.forEach(trigger => {
            const result = shouldRunAutoCategorization({
                ...baseContext,
                trigger,
            });
            expect(result.shouldRun).toBe(true);
            expect(result.reason).toContain('New transaction');
        });
    });

    describe('Email Enrichment Rule', () => {
        it('should NOT run if no new merchant info provided', () => {
            const result = shouldRunAutoCategorization({
                ...baseContext,
                trigger: 'email_enriched',
                newMerchantInfo: undefined,
            });
            expect(result.shouldRun).toBe(false);
            expect(result.reason).toContain('no new merchant info');
        });

        it('should run if no current category and email provides merchant info', () => {
            const result = shouldRunAutoCategorization({
                ...baseContext,
                trigger: 'email_enriched',
                newMerchantInfo: 'Amazon',
                currentCategory: null,
            });
            expect(result.shouldRun).toBe(true);
            expect(result.reason).toContain('No category yet');
        });

        it('should run if email info is "better" (longer)', () => {
            const result = shouldRunAutoCategorization({
                ...baseContext,
                trigger: 'email_enriched',
                currentCategory: 'Shopping',
                categorySource: 'auto',
                previousMerchant: 'Amzn',
                newMerchantInfo: 'Amazon UK',
            });
            expect(result.shouldRun).toBe(true);
            expect(result.reason).toContain('better merchant info');
        });

        it('should run if email info is "better" (has Hebrew)', () => {
            const result = shouldRunAutoCategorization({
                ...baseContext,
                trigger: 'email_enriched',
                currentCategory: 'Food',
                categorySource: 'auto',
                previousMerchant: 'Mcdonalds',
                newMerchantInfo: 'מקדולנס',
            });
            expect(result.shouldRun).toBe(true);
        });

        it('should NOT run if email info is NOT better', () => {
            const result = shouldRunAutoCategorization({
                ...baseContext,
                trigger: 'email_enriched',
                currentCategory: 'Shopping',
                categorySource: 'auto',
                previousMerchant: 'Amazon UK',
                newMerchantInfo: 'Amzn', // Shorter
            });
            expect(result.shouldRun).toBe(false);
            expect(result.reason).toContain('existing info is sufficient');
        });
    });
});
