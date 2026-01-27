import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/env';
import { InstallmentInfo } from '@/lib/parsing/types';

export const createClient = () =>
  createBrowserClient(
    clientEnv.SUPABASE_URL,
    clientEnv.SUPABASE_ANON_KEY
  );

// Transaction types
export type TransactionStatus = 'pending' | 'categorized' | 'skipped' | 'verified' | 'flagged';
export type TransactionType = 'income' | 'expense';

export type Transaction = {
    id: string;
    household_id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized: string | null;
    amount: number;
    currency: string;
    category: string | null;
    category_confidence: number | null;
    type: TransactionType;
    is_reimbursement: boolean;
    is_recurring: boolean;
    is_installment: boolean;
    installment_info: InstallmentInfo | null;
    is_duplicate: boolean;
    duplicate_of: string | null;
    source: string;
    status: TransactionStatus;
    user_verified: boolean;
    created_at: string;
    updated_at: string;
};

export type Category = {
  id: string;
  name_hebrew: string;
  name_english: string;
  type: 'expense' | 'income';
  description: string | null;
  keywords: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MerchantMemory = {
  id: string;
  household_id: string;
  merchant_normalized: string;
  category: string;
  confidence: number;
  correction_count: number;
  last_seen: string;
  created_at: string;
};

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  language?: 'en' | 'he';
  currency?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
  };
  dashboard?: {
    defaultView?: string;
    showTrends?: boolean;
  };
}

export type UserProfile = {
  id: string;
  household_id: string;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
};
