-- Lock down fantasy tables: the app only ever touches these through
-- getServiceClient() (service_role) in the API routes, but the anon key is
-- shipped to the browser, so with RLS disabled PostgREST exposed full CRUD
-- on all three tables to anyone. Server-only pattern: RLS on, no anon or
-- authenticated grants, service_role retains unrestricted access.

ALTER TABLE public.fantasy_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dotd_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_prices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fantasy_lineups FROM anon, authenticated;
REVOKE ALL ON public.dotd_votes FROM anon, authenticated;
REVOKE ALL ON public.fantasy_prices FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_lineups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dotd_votes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fantasy_prices TO service_role;
