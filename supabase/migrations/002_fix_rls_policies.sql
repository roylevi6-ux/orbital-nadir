-- Simplified function to create user profile without master password
-- Run this in Supabase SQL Editor

-- Drop old function
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text);

-- Create new simplified function
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id uuid,
  user_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
  result json;
BEGIN
  -- Create household
  INSERT INTO households (name)
  VALUES (user_email || '''s Household')
  RETURNING id INTO new_household_id;

  -- Create user profile (without master password)
  INSERT INTO user_profiles (id, household_id, preferences)
  VALUES (user_id, new_household_id, '{}');

  -- Return result
  result := json_build_object(
    'household_id', new_household_id,
    'user_id', user_id
  );

  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text) TO authenticated;
