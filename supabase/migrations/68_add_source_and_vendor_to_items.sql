-- Migration 68: Add source and vendor columns to public.items
-- Rationale: Tracks material sourcing (Local / Import) and vendor/supplier information directly on master items

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS vendor TEXT;

-- High-Efficiency indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_items_source ON public.items (source);
CREATE INDEX IF NOT EXISTS idx_items_vendor ON public.items (vendor);
