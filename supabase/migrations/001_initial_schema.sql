-- Initial Database Schema for Household Finance App
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & HOUSEHOLDS
-- ============================================

-- Households table (links 2 users together)
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles (extends auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  master_password_hash TEXT NOT NULL,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CATEGORIES
-- ============================================

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_hebrew TEXT NOT NULL,
  name_english TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  description TEXT,
  keywords TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS
-- ============================================

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  merchant_raw TEXT NOT NULL,
  merchant_normalized TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  category TEXT,
  category_confidence INTEGER,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  is_reimbursement BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  is_installment BOOLEAN DEFAULT FALSE,
  installment_info JSONB,
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of UUID REFERENCES transactions(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'categorized', 'skipped', 'verified')),
  user_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_transactions_household_date ON transactions(household_id, date DESC);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_merchant ON transactions(merchant_normalized);
CREATE INDEX idx_transactions_status ON transactions(status);

-- ============================================
-- MERCHANT MEMORY (Household-specific learning)
-- ============================================

CREATE TABLE merchant_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  merchant_normalized TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence INTEGER DEFAULT 95,
  correction_count INTEGER DEFAULT 1,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(household_id, merchant_normalized)
);

CREATE INDEX idx_merchant_memory_household ON merchant_memory(household_id);

-- ============================================
-- SOURCE MAPPINGS (Column mapping storage)
-- ============================================

CREATE TABLE source_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('google_sheets', 'excel', 'csv', 'pdf')),
  column_mapping JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(household_id, source_name, source_type)
);

-- ============================================
-- SKIP QUEUE
-- ============================================

CREATE TABLE skip_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  skipped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_skip_queue_household ON skip_queue(household_id) WHERE resolved_at IS NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE skip_queue ENABLE ROW LEVEL SECURITY;

-- Households: Users can only see their own household
CREATE POLICY "Users can view their own household"
  ON households FOR SELECT
  USING (id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

-- User profiles: Users can only see their own profile
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- Transactions: Users can only see their household's transactions
CREATE POLICY "Users can view household transactions"
  ON transactions FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert household transactions"
  ON transactions FOR INSERT
  WITH CHECK (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update household transactions"
  ON transactions FOR UPDATE
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete household transactions"
  ON transactions FOR DELETE
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

-- Merchant memory: Users can only access their household's memory
CREATE POLICY "Users can view household merchant memory"
  ON merchant_memory FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert household merchant memory"
  ON merchant_memory FOR INSERT
  WITH CHECK (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update household merchant memory"
  ON merchant_memory FOR UPDATE
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

-- Source mappings: Users can only access their household's mappings
CREATE POLICY "Users can view household source mappings"
  ON source_mappings FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert household source mappings"
  ON source_mappings FOR INSERT
  WITH CHECK (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

-- Skip queue: Users can only access their household's skip queue
CREATE POLICY "Users can view household skip queue"
  ON skip_queue FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert household skip queue"
  ON skip_queue FOR INSERT
  WITH CHECK (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update household skip queue"
  ON skip_queue FOR UPDATE
  USING (household_id IN (
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
  ));

-- Categories: Public read access (no RLS needed, but enable for consistency)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view categories"
  ON categories FOR SELECT
  USING (TRUE);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
