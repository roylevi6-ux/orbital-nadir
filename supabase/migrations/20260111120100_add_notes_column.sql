-- Add notes column to transactions table
ALTER TABLE transactions
ADD COLUMN notes TEXT;

-- Add index for text search on notes if needed later
CREATE INDEX idx_transactions_notes ON transactions(notes);
