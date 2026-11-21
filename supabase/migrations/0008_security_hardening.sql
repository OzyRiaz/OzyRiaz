-- 0008: security hardening found by the Supabase security advisor. Safe to re-run. No data is touched.
-- Trigger functions never need to be callable through the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- Fix the search path on the column-protection trigger functions.
alter function public.protect_profile_columns() set search_path = public;
alter function public.protect_restaurant_columns() set search_path = public;
