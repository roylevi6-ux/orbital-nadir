-- Add receipt reference to transactions table
-- Links a transaction to its matched email receipt for enrichment

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES email_receipts(id) ON DELETE SET NULL;

-- Index for finding transactions by receipt (and checking if already matched)
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_id ON transactions(receipt_id)
  WHERE receipt_id IS NOT NULL;

COMMENT ON COLUMN transactions.receipt_id IS 'Reference to matched email receipt for merchant name enrichment';
