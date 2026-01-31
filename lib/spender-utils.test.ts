import { describe, it, expect } from 'vitest';
import { extractCardEnding } from './spender-utils';

describe('Spender Utils', () => {
    describe('extractCardEnding', () => {
        it('should extract 4 digits after asterisk', () => {
            expect(extractCardEnding('Card *1234 charged')).toBe('1234');
        });

        it('should extract 4 digits after Hebrew "card"', () => {
            expect(extractCardEnding('כרטיס 5678 חוייב')).toBe('5678');
        });

        it('should extract 4 digits after "card ending"', () => {
            expect(extractCardEnding('Your card ending 9012')).toBe('9012');
        });

        it('should extract 4 digits after "xxxx"', () => {
            expect(extractCardEnding('Card xxxx3456 used')).toBe('3456');
        });

        it('should extract 4 digits at start of string with separator', () => {
            expect(extractCardEnding('1111_invoice.pdf')).toBe('1111');
            expect(extractCardEnding('2222-receipt.pdf')).toBe('2222');
        });

        it('should extract 4 digits in middle of string with separators', () => {
            expect(extractCardEnding('inv_3333_final.pdf')).toBe('3333');
        });

        it('should extract 4 digits at end of string', () => {
            expect(extractCardEnding('receipt4444')).toBe('4444');
        });

        it('should return null when no pattern matches', () => {
            expect(extractCardEnding('No card number here')).toBeNull();
            expect(extractCardEnding('Order number #123')).toBeNull(); // 3 digits shouldn't match
        });
    });
});
