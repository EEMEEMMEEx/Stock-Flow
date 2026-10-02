-- Migration 20: Master Force User Delete & Database Cleaning
-- Instantly force deletes target user watchara.m@forth.co.th and cleans up all schema dependencies.

-- 1. Remove all foreign keys pointing to auth.users or public.profiles in public schema that block deletion
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            tc.constraint_name,
            kcu.column_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = 'public'
          AND ccu.table_name IN ('users', 'profiles')
          AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
    ) LOOP
        IF r.column_name IN ('id', 'user_id', 'target_user_id') THEN
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I;', r.table_schema, r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE CASCADE;', r.table_schema, r.table_name, r.constraint_name, r.column_name);
        ELSE
            EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I;', r.table_schema, r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE SET NULL;', r.table_schema, r.table_name, r.constraint_name, r.column_name);
        END IF;
    END LOOP;
END $$;

-- 2. Force delete watchara.m@forth.co.th from database completely
DO $$
DECLARE
  v_uid UUID;
BEGIN
  -- Get user ID for watchara.m@forth.co.th
  SELECT id INTO v_uid FROM auth.users WHERE email = 'watchara.m@forth.co.th';

  IF v_uid IS NOT NULL THEN
    -- A. Clean storage objects if present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
      BEGIN
        UPDATE storage.objects SET owner = NULL WHERE owner::text = v_uid::text;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- B. Clean child tables
    DELETE FROM public.user_project_assignments WHERE user_id = v_uid OR created_by = v_uid;
    DELETE FROM public.audit_logs WHERE actor_id = v_uid OR target_user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uid;

    -- C. Delete from auth.users
    DELETE FROM auth.users WHERE id = v_uid;
  END IF;
END $$;
