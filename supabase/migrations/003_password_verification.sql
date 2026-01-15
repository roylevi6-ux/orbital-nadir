-- Enable pgcrypto extension and create password verification function
-- Run this in Supabase SQL Editor

-- Enable the extension in the public schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Drop function if exists
DROP FUNCTION IF EXISTS verify_master_password(uuid, text);

-- Create function to verify password
-- Note: We're using a simpler approach - just return the hash and verify in the app
CREATE OR REPLACE FUNCTION get_user_password_hash(
  user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  -- Get the stored password hash
  SELECT master_password_hash INTO stored_hash
  FROM user_profiles
  WHERE id = user_id;

  RETURN stored_hash;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_password_hash(uuid) TO authenticated;
