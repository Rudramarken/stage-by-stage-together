-- Purpose: let an own vehicle record its assigned driver (Part 2 of the audit).
-- Safe: adds ONE nullable column. No rows, columns, tables, policies or ledger data are changed; existing vehicles keep driver_id = NULL.
-- Prerequisite: run in the Supabase SQL editor of the live project BEFORE using the new Vehicles form (saving a vehicle sends driver_id).
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id);
CREATE INDEX IF NOT EXISTS vehicles_driver_id_idx ON public.vehicles(driver_id);
-- Verify: SELECT column_name FROM information_schema.columns WHERE table_name='vehicles' AND column_name='driver_id';
