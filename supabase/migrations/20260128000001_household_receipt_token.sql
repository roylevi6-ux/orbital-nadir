-- Add unique receipt forwarding token to households
-- Format: receipts+{token}@orbital-nadir.app

-- Add the column (nullable first for existing rows)
ALTER TABLE households
ADD COLUMN IF NOT EXISTS receipt_token TEXT UNIQUE;

-- Generate random 16-character hex tokens for all existing households
UPDATE households
SET receipt_token = encode(gen_random_bytes(8), 'hex')
WHERE receipt_token IS NULL;

-- Now make it NOT NULL with a default for new households
ALTER TABLE households
ALTER COLUMN receipt_token SET NOT NULL;

ALTER TABLE households
ALTER COLUMN receipt_token SET DEFAULT encode(gen_random_bytes(8), 'hex');

-- Index for fast lookup when webhook receives email
CREATE INDEX IF NOT EXISTS idx_households_receipt_token ON households(receipt_token);

COMMENT ON COLUMN households.receipt_token IS 'Unique 16-char hex token for email forwarding (receipts+{token}@domain)';
