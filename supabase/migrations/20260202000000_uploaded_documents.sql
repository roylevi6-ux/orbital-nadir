-- Migration: Uploaded Documents Tracking
-- Track all uploaded files and link transactions to their source documents

-- Create uploaded_documents table
CREATE TABLE IF NOT EXISTS uploaded_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'pdf', 'xlsx', 'xls', 'screenshot', 'image')),
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    spender TEXT CHECK (spender IN ('R', 'N')),
    transaction_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast household lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_household
    ON uploaded_documents(household_id, status, upload_date DESC);

-- Add document_id column to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL;

-- Index for document lookups on transactions
CREATE INDEX IF NOT EXISTS idx_transactions_document_id
    ON transactions(document_id)
    WHERE document_id IS NOT NULL;

-- Enable RLS on uploaded_documents
ALTER TABLE uploaded_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for uploaded_documents (same pattern as other tables)
CREATE POLICY "Users can view household uploaded documents"
    ON uploaded_documents FOR SELECT
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert household uploaded documents"
    ON uploaded_documents FOR INSERT
    WITH CHECK (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update household uploaded documents"
    ON uploaded_documents FOR UPDATE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete household uploaded documents"
    ON uploaded_documents FOR DELETE
    USING (household_id IN (
        SELECT household_id FROM user_profiles WHERE id = auth.uid()
    ));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_uploaded_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_uploaded_documents_updated_at
    BEFORE UPDATE ON uploaded_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_uploaded_documents_updated_at();

-- Comments for documentation
COMMENT ON TABLE uploaded_documents IS 'Tracks all uploaded files (CC slips, bank statements, screenshots) for batch management';
COMMENT ON COLUMN uploaded_documents.file_type IS 'Type of uploaded file: csv, pdf, xlsx, xls, screenshot, image';
COMMENT ON COLUMN uploaded_documents.spender IS 'Which household member uploaded this (R or N), null if mixed or unknown';
COMMENT ON COLUMN uploaded_documents.status IS 'active = visible, deleted = soft-deleted (hidden but preserved)';
COMMENT ON COLUMN transactions.document_id IS 'Reference to the uploaded document that created this transaction';
