/* eslint-disable @typescript-eslint/no-explicit-any */
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// Keep types for reference
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
  type: 'expense' | 'income';
  is_reimbursement: boolean;
  is_recurring: boolean;
  is_installment: boolean;
  installment_info: any | null;
  is_duplicate: boolean;
  duplicate_of: string | null;
  source: string;
  status: 'pending' | 'categorized' | 'skipped' | 'verified';
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

export type UserProfile = {
  id: string;
  household_id: string;
  preferences: any;
  created_at: string;
  updated_at: string;
};
