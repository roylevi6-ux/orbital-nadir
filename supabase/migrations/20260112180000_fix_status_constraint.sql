-- Migration to update transactions status check constraint
-- Created to allow 'flagged' status for medium-confidence AI suggestions

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_status_check 
CHECK (status IN ('pending', 'categorized', 'flagged', 'skipped', 'verified'));
