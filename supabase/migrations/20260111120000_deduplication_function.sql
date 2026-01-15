-- Function to remove exact duplicate transactions
-- Duplicates defined as: Same household, date, amount, merchant, and type
-- Keeps the earliest record (by created_at or id)

CREATE OR REPLACE FUNCTION cleanup_exact_duplicates(
  target_household_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY date, amount, merchant_raw, type 
             ORDER BY created_at ASC, id ASC
           ) as rn
    FROM transactions
    WHERE household_id = target_household_id
  )
  DELETE FROM transactions
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION cleanup_exact_duplicates(uuid) TO authenticated;
