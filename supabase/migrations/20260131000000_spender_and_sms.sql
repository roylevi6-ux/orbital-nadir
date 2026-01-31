-- Migration: Spender Tracking + SMS Transactions
-- Created: 2026-01-31
-- Features:
--   1. Spender tracking (R/N per transaction)
--   2. SMS transaction ingestion
--   3. Source attribution for transactions
--   4. Auto-categorization tracking

-- ============================================
-- SPENDER CONFIGURATION
-- ============================================

-- Spender configuration per household
CREATE TABLE IF NOT EXISTS household_spenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
    spender_key TEXT NOT NULL,  -- 'R' or 'N' (internal key)
    display_name TEXT NOT NULL,  -- Customizable: "Roy", "Noa", etc.
    color TEXT DEFAULT '#3B82F6',  -- Hex color for UI
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, spender_key)
);

-- Card-to-spender mapping table
CREATE TABLE IF NOT EXISTS household_card_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
    card_ending TEXT NOT NULL,  -- Last 4 digits
    spender TEXT NOT NULL CHECK (spender IN ('R', 'N')),
    card_nickname TEXT,  -- e.g., "Roy's Isracard", "Noa's Max"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, card_ending)
);

-- ============================================
-- SMS TRANSACTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS sms_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
    card_ending TEXT NOT NULL,
    merchant_name TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'ILS',
    transaction_date DATE NOT NULL,
    spender TEXT CHECK (spender IN ('R', 'N')),
    provider TEXT CHECK (provider IN ('isracard', 'cal', 'max', 'leumi', 'unknown')),
    raw_message TEXT NOT NULL,
    -- Link to transaction created from this SMS
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    -- Deduplication tracking (when CC slip arrives)
    cc_matched BOOLEAN DEFAULT FALSE,
    cc_matched_at TIMESTAMPTZ,
    -- Metadata
    received_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for SMS transactions
CREATE INDEX IF NOT EXISTS idx_sms_pending ON sms_transactions(household_id, cc_matched)
    WHERE cc_matched = FALSE;
CREATE INDEX IF NOT EXISTS idx_sms_matching ON sms_transactions(household_id, transaction_date, amount);
CREATE INDEX IF NOT EXISTS idx_sms_household ON sms_transactions(household_id);

-- ============================================
-- TRANSACTIONS TABLE MODIFICATIONS
-- ============================================

-- Add spender column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS spender TEXT CHECK (spender IN ('R', 'N'));

-- Add SMS source link
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS sms_id UUID REFERENCES sms_transactions(id) ON DELETE SET NULL;

-- Add CC slip source tracking
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source_file TEXT;  -- Original filename for CC slip

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source_row INTEGER;  -- Row number in source file

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS cc_slip_linked_at TIMESTAMPTZ;

-- Add category source tracking (auto vs user_manual vs rule)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS category_source TEXT CHECK (category_source IN ('auto', 'user_manual', 'rule'));

-- Add source priority tracking
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source_priority TEXT DEFAULT 'cc_slip'
    CHECK (source_priority IN ('sms', 'cc_slip', 'bank', 'bit_standalone'));

-- Update status constraint to include 'provisional'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions
ADD CONSTRAINT transactions_status_check
CHECK (status IN ('pending', 'provisional', 'categorized', 'flagged', 'skipped', 'verified'));

-- Index for spender queries
CREATE INDEX IF NOT EXISTS idx_transactions_spender ON transactions(household_id, spender);

-- Index for SMS-linked transactions
CREATE INDEX IF NOT EXISTS idx_transactions_sms_id ON transactions(sms_id) WHERE sms_id IS NOT NULL;

-- ============================================
-- EMAIL RECEIPTS TABLE MODIFICATIONS
-- ============================================

-- Add source_type to distinguish email vs SMS receipts
ALTER TABLE email_receipts
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'email'
    CHECK (source_type IN ('email', 'sms'));

-- Add card_ending for SMS receipts
ALTER TABLE email_receipts
ADD COLUMN IF NOT EXISTS card_ending TEXT;

-- Index for SMS receipts
CREATE INDEX IF NOT EXISTS idx_email_receipts_source_type
    ON email_receipts(household_id, source_type, receipt_date);

-- ============================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE household_spenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_card_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_transactions ENABLE ROW LEVEL SECURITY;

-- Household spenders policies
CREATE POLICY "Users can view household spenders"
    ON household_spenders FOR SELECT
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert household spenders"
    ON household_spenders FOR INSERT
    WITH CHECK (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update household spenders"
    ON household_spenders FOR UPDATE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete household spenders"
    ON household_spenders FOR DELETE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

-- Card mappings policies
CREATE POLICY "Users can view household card mappings"
    ON household_card_mappings FOR SELECT
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert household card mappings"
    ON household_card_mappings FOR INSERT
    WITH CHECK (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update household card mappings"
    ON household_card_mappings FOR UPDATE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete household card mappings"
    ON household_card_mappings FOR DELETE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

-- SMS transactions policies
CREATE POLICY "Users can view household sms transactions"
    ON sms_transactions FOR SELECT
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert household sms transactions"
    ON sms_transactions FOR INSERT
    WITH CHECK (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update household sms transactions"
    ON sms_transactions FOR UPDATE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete household sms transactions"
    ON sms_transactions FOR DELETE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

-- ============================================
-- SEED DEFAULT SPENDERS FOR EXISTING HOUSEHOLDS
-- ============================================

-- Insert default spenders R and N for all existing households
INSERT INTO household_spenders (household_id, spender_key, display_name, color)
SELECT id, 'R', 'R', '#3B82F6' FROM households
WHERE NOT EXISTS (
    SELECT 1 FROM household_spenders hs
    WHERE hs.household_id = households.id AND hs.spender_key = 'R'
);

INSERT INTO household_spenders (household_id, spender_key, display_name, color)
SELECT id, 'N', 'N', '#EC4899' FROM households
WHERE NOT EXISTS (
    SELECT 1 FROM household_spenders hs
    WHERE hs.household_id = households.id AND hs.spender_key = 'N'
);

-- ============================================
-- SEED KNOWN CARD MAPPINGS
-- ============================================

-- Insert known card mappings (R = 8770, N = 8937, 6892, 5592)
-- Only insert if household exists and mapping doesn't exist
DO $$
DECLARE
    h_id UUID;
BEGIN
    -- Get the first household (for single-household setup)
    SELECT id INTO h_id FROM households LIMIT 1;

    IF h_id IS NOT NULL THEN
        -- R's card
        INSERT INTO household_card_mappings (household_id, card_ending, spender, card_nickname)
        VALUES (h_id, '8770', 'R', 'R - Isracard')
        ON CONFLICT (household_id, card_ending) DO NOTHING;

        -- N's cards
        INSERT INTO household_card_mappings (household_id, card_ending, spender, card_nickname)
        VALUES (h_id, '8937', 'N', 'N - Card 1')
        ON CONFLICT (household_id, card_ending) DO NOTHING;

        INSERT INTO household_card_mappings (household_id, card_ending, spender, card_nickname)
        VALUES (h_id, '6892', 'N', 'N - Card 2')
        ON CONFLICT (household_id, card_ending) DO NOTHING;

        INSERT INTO household_card_mappings (household_id, card_ending, spender, card_nickname)
        VALUES (h_id, '5592', 'N', 'N - Card 3')
        ON CONFLICT (household_id, card_ending) DO NOTHING;
    END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE household_spenders IS 'Spender configuration per household (R and N)';
COMMENT ON TABLE household_card_mappings IS 'Maps credit card last-4 digits to spender (R/N)';
COMMENT ON TABLE sms_transactions IS 'Incoming SMS transaction notifications from credit card providers';
COMMENT ON COLUMN transactions.spender IS 'Who made this transaction: R or N';
COMMENT ON COLUMN transactions.sms_id IS 'Link to original SMS if transaction was created from SMS';
COMMENT ON COLUMN transactions.source_file IS 'Original filename for CC slip uploads';
COMMENT ON COLUMN transactions.source_row IS 'Row number in original source file';
COMMENT ON COLUMN transactions.category_source IS 'How category was set: auto (AI), user_manual, or rule';
COMMENT ON COLUMN transactions.source_priority IS 'Primary data source: sms, cc_slip, bank, bit_standalone';
COMMENT ON COLUMN email_receipts.source_type IS 'email: standard email receipt, sms: forwarded credit card SMS notification';
COMMENT ON COLUMN email_receipts.card_ending IS 'Last 4 digits of card (from SMS), useful for multi-card matching';
