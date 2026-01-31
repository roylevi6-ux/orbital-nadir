/**
 * Spender utility functions and types
 * These are client-safe utilities that don't require server actions
 */

export type Spender = 'R' | 'N';

export interface SpenderConfig {
    spender_key: Spender;
    display_name: string;
    color: string;
}

export interface CardMapping {
    card_ending: string;
    spender: Spender;
    card_nickname: string | null;
}

export interface SpenderDetectionResult {
    detected: boolean;
    spender: Spender | null;
    card_ending: string | null;
    source: 'card_mapping' | 'filename' | 'header' | 'manual';
    confidence: number;
}

/**
 * Patterns to detect card endings in various formats
 */
const CARD_PATTERNS = [
    /\*(\d{4})/,                    // *8770
    /כרטיס\s*(\d{4})/,              // כרטיס 8770
    /card\s*ending\s*(\d{4})/i,     // card ending 8770
    /xxxx\s*(\d{4})/i,              // xxxx8770
    /(\d{4})\s*$/,                  // ...8770 at end
];

/**
 * Extract card ending from text using various patterns
 */
export function extractCardEnding(text: string): string | null {
    for (const pattern of CARD_PATTERNS) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}
