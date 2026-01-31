-- QA Fixes Migration
-- Adds missing indexes and constraints identified during QA audit

-- ============================================
-- INDEX: sms_id lookups on transactions
-- Improves performance when matching CC slips to SMS transactions
-- ============================================
CREATE INDEX IF NOT EXISTS idx_transactions_sms_id
    ON transactions(sms_id)
    WHERE sms_id IS NOT NULL;

-- ============================================
-- INDEX: source_file lookups for deduplication
-- ============================================
CREATE INDEX IF NOT EXISTS idx_transactions_source_file
    ON transactions(household_id, source_file)
    WHERE source_file IS NOT NULL;

-- ============================================
-- CONSTRAINT: card_ending format validation
-- Must be exactly 4 digits
-- ============================================

-- Add check constraint for card_ending format (4 digits only)
-- First, check if any invalid data exists and clean it
UPDATE household_card_mappings
SET card_ending = regexp_replace(card_ending, '[^0-9]', '', 'g')
WHERE card_ending !~ '^\d{4}$';

-- Now add the constraint (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'household_card_mappings_card_ending_format'
    ) THEN
        ALTER TABLE household_card_mappings
        ADD CONSTRAINT household_card_mappings_card_ending_format
        CHECK (card_ending ~ '^\d{4}$');
    END IF;
END $$;

-- Also add constraint on sms_transactions.card_ending
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sms_transactions_card_ending_format'
    ) THEN
        ALTER TABLE sms_transactions
        ADD CONSTRAINT sms_transactions_card_ending_format
        CHECK (card_ending ~ '^\d{4}$');
    END IF;
END $$;

-- ============================================
-- INDEX: Improve SMS matching performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sms_transactions_matching
    ON sms_transactions(household_id, transaction_date, amount)
    WHERE cc_matched = FALSE;

-- ============================================
-- FUNCTION: Cleanup old orphaned SMS records
-- SMS records older than 60 days without CC match should be flagged
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_orphaned_sms()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    -- Mark transactions from unmatched SMS older than 60 days as flagged
    UPDATE transactions
    SET status = 'flagged',
        notes = COALESCE(notes || E'\n', '') || 'Auto-flagged: SMS transaction not confirmed by CC slip after 60 days'
    WHERE status = 'provisional'
      AND sms_id IS NOT NULL
      AND created_at < NOW() - INTERVAL '60 days';

    GET DIAGNOSTICS affected_count = ROW_COUNT;

    RETURN affected_count;
END;
$$;

-- ============================================
-- COMMENTS: Document the constraints
-- ============================================
COMMENT ON CONSTRAINT household_card_mappings_card_ending_format ON household_card_mappings
    IS 'Card ending must be exactly 4 digits';

COMMENT ON FUNCTION cleanup_orphaned_sms()
    IS 'Flags provisional transactions from SMS that have not been confirmed by CC slip after 60 days';
