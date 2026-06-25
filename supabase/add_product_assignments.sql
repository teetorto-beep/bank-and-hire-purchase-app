-- ============================================================
-- Product Assignments — limit and track customers per product
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add max_customers column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_customers int DEFAULT NULL;
-- NULL = unlimited, 1 = exclusive, 100 = up to 100 customers

-- 2. Create product_assignments table
CREATE TABLE IF NOT EXISTS product_assignments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  account_id  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by text,
  notes       text,
  UNIQUE(product_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_product_assignments_product  ON product_assignments(product_id);
CREATE INDEX IF NOT EXISTS idx_product_assignments_customer ON product_assignments(customer_id);

-- 3. RLS
ALTER TABLE product_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON product_assignments FOR ALL USING (true) WITH CHECK (true);

-- 4. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'product_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE product_assignments;
  END IF;
END $$;

ALTER TABLE product_assignments REPLICA IDENTITY FULL;

-- Verify
SELECT 'product_assignments table ready' AS status;
