import { describe, it, expect } from 'vitest';
import { isCreditCardSms, detectProvider } from './sms-utils';

describe('SMS Utils', () => {
    describe('isCreditCardSms', () => {
        it('should identify valid credit card triggers', () => {
            expect(isCreditCardSms('אושרה עסקה בסך 50 ₪')).toBe(true);
            expect(isCreditCardSms('בוצעה עסקה בכרטיס')).toBe(true);
            expect(isCreditCardSms('בוצע חיוב בחשבונך')).toBe(true);
        });

        it('should reject non-transaction messages', () => {
            expect(isCreditCardSms('שלום רב, החבילה הגיעה')).toBe(false);
            expect(isCreditCardSms('קוד אימות: 123456')).toBe(false);
        });
    });

    describe('detectProvider', () => {
        it('should detect Cal', () => {
            expect(detectProvider('ויזה כאל: עסקה אושרה')).toBe('cal');
            expect(detectProvider('Cal transaction approved')).toBe('cal');
        });

        it('should detect Max', () => {
            expect(detectProvider('Max: New transaction')).toBe('max');
            expect(detectProvider('מקס איט פיננסים')).toBe('max');
        });

        it('should detect Isracard', () => {
            expect(detectProvider('Isracard: Deal approved')).toBe('isracard');
            expect(detectProvider('חיוב בכרטיסך ב-100 ש"ח')).toBe('isracard'); // 'בכרטיסך' is a trigger for isracard in the code
        });

        it('should detect Leumi', () => {
            expect(detectProvider('לאומי קארד: עסקה')).toBe('leumi');
            expect(detectProvider('Leumi Card')).toBe('leumi');
        });

        it('should return unknown for unidentified providers', () => {
            expect(detectProvider('Generic Bank Message')).toBe('unknown');
        });
    });
});
