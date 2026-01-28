-- Add original foreign currency fields to transactions
-- For Israeli CC statements, the amount is in ILS but foreign transactions
-- have original amount/currency (e.g., €5.64 -> ₪22.14)

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS original_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS original_currency TEXT;

-- Index for receipt matching by original currency
CREATE INDEX IF NOT EXISTS idx_transactions_original_currency
ON transactions(original_currency)
WHERE original_currency IS NOT NULL;

COMMENT ON COLUMN transactions.original_amount IS 'Original amount in foreign currency (for FX transactions)';
COMMENT ON COLUMN transactions.original_currency IS 'Original currency code (EUR, USD, etc.) for FX transactions';
