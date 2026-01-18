-- Bulk update function for AI categorization performance
-- This replaces 50+ individual UPDATE calls with a single RPC call

CREATE OR REPLACE FUNCTION bulk_update_transactions(updates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER := 0;
    update_item JSONB;
BEGIN
    FOR update_item IN SELECT * FROM jsonb_array_elements(updates)
    LOOP
        UPDATE transactions
        SET 
            category = COALESCE(update_item->>'category', category),
            merchant_normalized = COALESCE(update_item->>'merchant_normalized', merchant_normalized),
            status = COALESCE(update_item->>'status', status),
            ai_suggestions = COALESCE((update_item->'ai_suggestions')::JSONB, ai_suggestions),
            category_confidence = COALESCE((update_item->>'confidence_score')::INTEGER, category_confidence)
        WHERE id = (update_item->>'id')::UUID;
        
        IF FOUND THEN
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    
    RETURN updated_count;
END;
$$;

-- Bulk update function for changing all merchant entries (for Smart Merchant Memory)
-- Supports fuzzy matching on merchant_normalized

CREATE OR REPLACE FUNCTION bulk_update_merchant_category(
    p_household_id UUID,
    p_merchant_pattern TEXT,
    p_new_category TEXT,
    p_fuzzy_match BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    IF p_fuzzy_match THEN
        -- Fuzzy match: merchant_normalized contains the pattern
        UPDATE transactions
        SET category = p_new_category
        WHERE household_id = p_household_id
          AND merchant_normalized ILIKE '%' || p_merchant_pattern || '%';
    ELSE
        -- Exact match only
        UPDATE transactions
        SET category = p_new_category
        WHERE household_id = p_household_id
          AND merchant_normalized = p_merchant_pattern;
    END IF;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;
