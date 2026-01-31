'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';
import { logger } from '@/lib/logger';
import { extractCardEnding } from '@/lib/spender-utils';
import type { Spender, SpenderConfig, CardMapping, SpenderDetectionResult } from '@/lib/spender-utils';

// Note: Types and sync utilities are exported from @/lib/spender-utils
// Import directly from there for client-side usage

/**
 * Get spender configuration for the household
 */
export async function getSpenderConfig(): Promise<ActionResult<SpenderConfig[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('household_spenders')
            .select('spender_key, display_name, color')
            .eq('household_id', householdId)
            .order('spender_key');

        if (error) {
            logger.error('[Spender] Failed to fetch spender config:', error);
            throw new Error('Failed to fetch spender configuration');
        }

        return data || [];
    });
}

/**
 * Get all card-to-spender mappings for the household
 */
export async function getCardMappings(): Promise<ActionResult<CardMapping[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('household_card_mappings')
            .select('card_ending, spender, card_nickname')
            .eq('household_id', householdId);

        if (error) {
            logger.error('[Spender] Failed to fetch card mappings:', error);
            throw new Error('Failed to fetch card mappings');
        }

        return data || [];
    });
}

/**
 * Add or update a card-to-spender mapping
 */
export async function saveCardMapping(
    cardEnding: string,
    spender: Spender,
    nickname?: string
): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('household_card_mappings')
            .upsert({
                household_id: householdId,
                card_ending: cardEnding,
                spender,
                card_nickname: nickname || null
            }, {
                onConflict: 'household_id,card_ending'
            });

        if (error) {
            logger.error('[Spender] Failed to save card mapping:', error);
            throw new Error('Failed to save card mapping');
        }

        logger.info('[Spender] Saved card mapping:', { cardEnding, spender, nickname });
    });
}

/**
 * Delete a card-to-spender mapping
 */
export async function deleteCardMapping(cardEnding: string): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('household_card_mappings')
            .delete()
            .eq('household_id', householdId)
            .eq('card_ending', cardEnding);

        if (error) {
            logger.error('[Spender] Failed to delete card mapping:', error);
            throw new Error('Failed to delete card mapping');
        }

        logger.info('[Spender] Deleted card mapping:', cardEnding);
    });
}

/**
 * Update spender display name and color
 */
export async function updateSpenderConfig(
    spenderKey: Spender,
    displayName: string,
    color: string
): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('household_spenders')
            .update({ display_name: displayName, color })
            .eq('household_id', householdId)
            .eq('spender_key', spenderKey);

        if (error) {
            logger.error('[Spender] Failed to update spender config:', error);
            throw new Error('Failed to update spender configuration');
        }

        logger.info('[Spender] Updated spender config:', { spenderKey, displayName, color });
    });
}

/**
 * Detect spender from card ending by looking up the mapping
 */
export async function detectSpenderFromCard(
    cardEnding: string
): Promise<ActionResult<Spender | null>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('household_card_mappings')
            .select('spender')
            .eq('household_id', householdId)
            .eq('card_ending', cardEnding)
            .single();

        if (error && error.code !== 'PGRST116') {  // PGRST116 = no rows
            logger.error('[Spender] Failed to lookup card mapping:', error);
            throw new Error('Failed to lookup card mapping');
        }

        return data?.spender as Spender | null;
    });
}

/**
 * Detect spender from file content (CSV header, filename, etc.)
 */
export async function detectSpenderFromFile(
    filename: string,
    headerRow?: string
): Promise<ActionResult<SpenderDetectionResult>> {
    return withAuth(async ({ supabase, householdId }) => {
        // Try to extract card ending from filename
        let cardEnding = extractCardEnding(filename);
        let source: SpenderDetectionResult['source'] = 'filename';

        // If not in filename, try header row
        if (!cardEnding && headerRow) {
            cardEnding = extractCardEnding(headerRow);
            source = 'header';
        }

        if (!cardEnding) {
            logger.info('[Spender] No card ending found in file');
            return {
                detected: false,
                spender: null,
                card_ending: null,
                source: 'manual',
                confidence: 0
            };
        }

        // Look up the card mapping
        const { data, error } = await supabase
            .from('household_card_mappings')
            .select('spender')
            .eq('household_id', householdId)
            .eq('card_ending', cardEnding)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('[Spender] Failed to lookup card mapping:', error);
            throw new Error('Failed to lookup card mapping');
        }

        if (!data) {
            logger.info('[Spender] Card ending found but no mapping:', cardEnding);
            return {
                detected: false,
                spender: null,
                card_ending: cardEnding,
                source,
                confidence: 50  // We found the card but don't know who
            };
        }

        logger.info('[Spender] Auto-detected spender:', {
            cardEnding,
            spender: data.spender,
            source
        });

        return {
            detected: true,
            spender: data.spender as Spender,
            card_ending: cardEnding,
            source,
            confidence: 100
        };
    });
}

/**
 * Detect spender from SMS card ending
 */
export async function detectSpenderFromSms(
    cardEnding: string
): Promise<ActionResult<SpenderDetectionResult>> {
    return withAuth(async ({ supabase, householdId }) => {
        // Look up the card mapping
        const { data, error } = await supabase
            .from('household_card_mappings')
            .select('spender')
            .eq('household_id', householdId)
            .eq('card_ending', cardEnding)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('[Spender] Failed to lookup card mapping:', error);
            throw new Error('Failed to lookup card mapping');
        }

        if (!data) {
            logger.info('[Spender] SMS card ending has no mapping:', cardEnding);
            return {
                detected: false,
                spender: null,
                card_ending: cardEnding,
                source: 'card_mapping',
                confidence: 0
            };
        }

        logger.info('[Spender] SMS spender detected:', {
            cardEnding,
            spender: data.spender
        });

        return {
            detected: true,
            spender: data.spender as Spender,
            card_ending: cardEnding,
            source: 'card_mapping',
            confidence: 100
        };
    });
}

/**
 * Get spender display info (name and color) for a spender key
 */
export async function getSpenderDisplayInfo(
    spenderKey: Spender
): Promise<ActionResult<{ display_name: string; color: string } | null>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('household_spenders')
            .select('display_name, color')
            .eq('household_id', householdId)
            .eq('spender_key', spenderKey)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('[Spender] Failed to get spender display info:', error);
            throw new Error('Failed to get spender display info');
        }

        return data || null;
    });
}
