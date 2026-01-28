-- Email receipts table for storing parsed email receipts
-- Used for matching with transactions to improve categorization accuracy

CREATE TABLE email_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- Email metadata
  sender_email TEXT NOT NULL,
  raw_subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Parsed receipt data (extracted by AI)
  merchant_name TEXT,
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'ILS',
  receipt_date DATE,
  items JSONB DEFAULT '[]', -- Array of {name, quantity?, price?}

  -- AI parsing metadata
  is_receipt BOOLEAN NOT NULL DEFAULT true,
  parse_confidence INTEGER, -- 0-100
  raw_email_body TEXT, -- Store truncated for debugging/reprocessing

  -- Matching with transactions
  matched_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  match_confidence INTEGER, -- 0-100
  matched_at TIMESTAMP WITH TIME ZONE,

  -- Lifecycle (auto-expire after 12 months)
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '12 months'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_email_receipts_household ON email_receipts(household_id);

-- Index for finding unmatched receipts to match with new transactions
CREATE INDEX idx_email_receipts_unmatched ON email_receipts(household_id, matched_transaction_id)
  WHERE matched_transaction_id IS NULL;

-- Index for the matching query: find receipts by household + amount + date range
CREATE INDEX idx_email_receipts_matching ON email_receipts(household_id, currency, amount, receipt_date)
  WHERE matched_transaction_id IS NULL;

-- Index for cleanup job to delete expired receipts
CREATE INDEX idx_email_receipts_expires ON email_receipts(expires_at);

-- Trigger for updated_at (uses existing function from 001_initial_schema.sql)
CREATE TRIGGER update_email_receipts_updated_at
  BEFORE UPDATE ON email_receipts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE email_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view household receipts"
  ON email_receipts FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete household receipts"
  ON email_receipts FOR DELETE
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

-- Note: INSERT is handled by admin client (webhook), not user-facing

-- Documentation comments
COMMENT ON TABLE email_receipts IS 'Stores parsed email receipts for matching with bank/CC transactions to improve categorization';
COMMENT ON COLUMN email_receipts.items IS 'JSON array of line items: [{name: string, quantity?: number, price?: number}]';
COMMENT ON COLUMN email_receipts.expires_at IS 'Auto-delete after 12 months for data retention compliance';
COMMENT ON COLUMN email_receipts.raw_email_body IS 'Truncated email body for debugging, max 10KB';
