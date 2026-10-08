-- Add role column to profiles table ('creator' or 'listener')
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'creator' CHECK (role IN ('creator', 'listener'));

-- Initialize existing profiles to 'creator' if null
UPDATE public.profiles
SET role = 'creator'
WHERE role IS NULL;
