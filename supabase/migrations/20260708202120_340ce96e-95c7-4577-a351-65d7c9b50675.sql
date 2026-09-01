REVOKE EXECUTE ON FUNCTION public.close_chat_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_chat_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_admin_message(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.close_chat_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_admin_message(uuid, text) TO authenticated, service_role;