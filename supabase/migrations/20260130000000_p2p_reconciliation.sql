-- P2P Reconciliation Schema Migration
-- Replaces generic duplicate detection with BIT/Paybox-specific reconciliation

-- Add reconciliation-specific columns to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'matched', 'balance_paid', 'standalone', 'reimbursement')),
ADD COLUMN IF NOT EXISTS reconciliation_group_id UUID,
ADD COLUMN IF NOT EXISTS p2p_counterparty TEXT,
ADD COLUMN IF NOT EXISTS p2p_memo TEXT,
ADD COLUMN IF NOT EXISTS p2p_direction TEXT CHECK (p2p_direction IN ('sent', 'received'));

-- Performance indexes for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_transactions_reconciliation_group
    ON transactions(reconciliation_group_id) WHERE reconciliation_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_reconciliation_pending
    ON transactions(household_id, reconciliation_status) WHERE reconciliation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transactions_p2p_direction
    ON transactions(household_id, p2p_direction) WHERE p2p_direction IS NOT NULL;

-- Column documentation
COMMENT ON COLUMN transactions.reconciliation_status IS
    'P2P reconciliation state: pending (needs review), matched (CC+App linked), balance_paid (App paid from wallet), standalone (unmatched CC), reimbursement (incoming P2P)';
COMMENT ON COLUMN transactions.reconciliation_group_id IS
    'UUID linking CC and App transactions that represent the same payment';
COMMENT ON COLUMN transactions.p2p_counterparty IS
    'Person/business name from BIT/Paybox screenshot (e.g., "יוסי כהן")';
COMMENT ON COLUMN transactions.p2p_memo IS
    'User memo from payment app, supports Hebrew and emojis';
COMMENT ON COLUMN transactions.p2p_direction IS
    'Direction of P2P transfer: sent (outgoing payment) or received (incoming reimbursement)';

-- Migrate existing data: mark old duplicates as matched
UPDATE transactions
SET reconciliation_status = 'matched'
WHERE is_duplicate = true AND duplicate_of IS NOT NULL;

-- Migrate existing reimbursements
UPDATE transactions
SET reconciliation_status = 'reimbursement'
WHERE is_reimbursement = true AND reconciliation_status = 'pending';

-- Mark BIT/Paybox source transactions that aren't matched as balance_paid
UPDATE transactions
SET reconciliation_status = 'balance_paid'
WHERE source = 'BIT/Paybox Screenshot'
  AND reconciliation_status = 'pending'
  AND is_duplicate = false
  AND p2p_direction = 'sent';

-- Mark non-P2P transactions as standalone (don't need reconciliation)
UPDATE transactions
SET reconciliation_status = 'standalone'
WHERE reconciliation_status = 'pending'
  AND source != 'BIT/Paybox Screenshot'
  AND NOT (merchant_raw ILIKE '%bit%' OR merchant_raw ILIKE '%paybox%' OR merchant_raw ILIKE '%ביט%' OR merchant_raw ILIKE '%פייבוקס%');

-- Add deprecation comments to old columns (keep for backward compatibility)
COMMENT ON COLUMN transactions.is_duplicate IS
    'DEPRECATED: Use reconciliation_status instead. Kept for backward compatibility.';
COMMENT ON COLUMN transactions.duplicate_of IS
    'DEPRECATED: Use reconciliation_group_id instead. Kept for backward compatibility.';
