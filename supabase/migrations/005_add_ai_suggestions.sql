-- Migration: Add ai_suggestions to transactions
-- Description: Stores the top 3 AI category guesses for user review

ALTER TABLE transactions
ADD COLUMN ai_suggestions JSONB;

-- Comment on column
COMMENT ON COLUMN transactions.ai_suggestions IS 'List of top AI category suggestions with confidence scores';
