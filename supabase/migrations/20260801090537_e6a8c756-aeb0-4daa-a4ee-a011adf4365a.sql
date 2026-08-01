ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS machine_name text,
  ADD COLUMN IF NOT EXISTS clamp_margin numeric NOT NULL DEFAULT 1.5;