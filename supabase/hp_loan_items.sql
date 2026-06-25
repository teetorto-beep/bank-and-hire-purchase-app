-- ============================================================
-- HP Loan Items — multi-item hire purchase per loan
-- Run in Supabase SQL Editor
-- ============================================================

-- Table: hp_loan_items
-- Links multiple HP items to a single loan
-- Stock is deducted only when loan is marked completed

CREATE TABLE IF NOT EXISTS hp_loan_items (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id     uuid NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES hp_items(id) ON DELETE RESTRICT,
  quantity    int NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL,
  total_price numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  item_name   text,
  item_image  text,
  added_at    timestamptz DEFAULT now(),
  added_by    text,
  UNIQUE(loan_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_hp_loan_items_loan ON hp_loan_items(loan_id);
CREATE INDEX IF NOT EXISTS idx_hp_loan_items_item ON hp_loan_items(item_id);

-- RLS
ALTER TABLE hp_loan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON hp_loan_items FOR ALL USING (true) WITH CHECK (true);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'hp_loan_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hp_loan_items;
  END IF;
END $$;

ALTER TABLE hp_loan_items REPLICA IDENTITY FULL;

SELECT 'hp_loan_items table ready' AS status;
