-- Remove master password column from user_profiles
-- Run this in Supabase SQL Editor

ALTER TABLE user_profiles DROP COLUMN IF EXISTS master_password_hash;
