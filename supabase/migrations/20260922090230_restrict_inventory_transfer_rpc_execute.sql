-- Restrict the transfer RPC to authenticated application sessions and the
-- server-side service role. The function body remains the authorization
-- boundary for inventory.transfer/inventory.manage.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_item_transfer(JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_item_transfer(UUID, UUID, UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_item_transfer(JSONB) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
