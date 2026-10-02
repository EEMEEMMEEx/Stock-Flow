-- ==============================================================================
-- BASELINE 01: Core Master Schema (Categories, Items, Projects, Locations)
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Categories (หมวดหมู่วัสดุ/อุปกรณ์)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Storage Locations (คลัง / สถานที่จัดเก็บ)
CREATE TABLE IF NOT EXISTS public.storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Projects (โครงการ)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_code TEXT,
  description TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'inactive')),
  owner_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Project Locations (ความสัมพันธ์โครงการและสถานที่จัดเก็บ)
CREATE TABLE IF NOT EXISTS public.project_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_location_id UUID NOT NULL REFERENCES public.storage_locations(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, storage_location_id)
);

-- 6. Items / Materials Master (รายการวัสดุและอุปกรณ์หลัก)
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT,
  sku TEXT UNIQUE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  description TEXT,
  notes TEXT,
  image_url TEXT,
  min_stock INTEGER DEFAULT 0,
  max_stock INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. High-Efficiency Indexes
CREATE INDEX IF NOT EXISTS idx_items_category_name ON public.items (category_id, name);
CREATE INDEX IF NOT EXISTS idx_items_sku ON public.items (sku);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status);
CREATE INDEX IF NOT EXISTS idx_storage_locations_status ON public.storage_locations (status);
CREATE INDEX IF NOT EXISTS idx_project_locations_proj ON public.project_locations (project_id);

-- 8. Row Level Security
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Read policies (Public / Authenticated read)
DROP POLICY IF EXISTS "Allow select categories" ON public.categories;
CREATE POLICY "Allow select categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select storage_locations" ON public.storage_locations;
CREATE POLICY "Allow select storage_locations" ON public.storage_locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select projects" ON public.projects;
CREATE POLICY "Allow select projects" ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select project_locations" ON public.project_locations;
CREATE POLICY "Allow select project_locations" ON public.project_locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select items" ON public.items;
CREATE POLICY "Allow select items" ON public.items FOR SELECT USING (true);

-- Authenticated mutation policies
DROP POLICY IF EXISTS "Allow authenticated insert categories" ON public.categories;
CREATE POLICY "Allow authenticated insert categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated insert storage_locations" ON public.storage_locations;
CREATE POLICY "Allow authenticated insert storage_locations" ON public.storage_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated insert projects" ON public.projects;
CREATE POLICY "Allow authenticated insert projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated insert project_locations" ON public.project_locations;
CREATE POLICY "Allow authenticated insert project_locations" ON public.project_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated insert items" ON public.items;
CREATE POLICY "Allow authenticated insert items" ON public.items FOR ALL TO authenticated USING (true) WITH CHECK (true);
