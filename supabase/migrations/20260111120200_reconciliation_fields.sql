-- Add reconciliation tracking fields to transactions table
-- Supports duplicate detection and expense linking for reimbursements

-- Add columns for duplicate tracking
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES transactions(id),
ADD COLUMN IF NOT EXISTS linked_to_transaction_id UUID REFERENCES transactions(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_of ON transactions(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_linked_to ON transactions(linked_to_transaction_id) WHERE linked_to_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_is_duplicate ON transactions(is_duplicate) WHERE is_duplicate = true;

-- Add comment for documentation
COMMENT ON COLUMN transactions.is_duplicate IS 'True if this transaction is a duplicate of another (e.g., BIT payment also appearing on CC)';
COMMENT ON COLUMN transactions.duplicate_of IS 'Reference to the primary transaction if this is a duplicate';
COMMENT ON COLUMN transactions.linked_to_transaction_id IS 'Reference to related transaction (e.g., reimbursement linked to original expense)';
