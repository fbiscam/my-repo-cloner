
-- Revoke EXECUTE from anon/public on SECURITY DEFINER functions that should not be anonymously callable.
-- Guest chat trio (create_chat_session, post_guest_message, get_guest_messages) intentionally allows anon.

REVOKE EXECUTE ON FUNCTION public.admin_auto_scan_cron_history() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.award_founding_referral(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.award_founding_referral_by_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_bump_counter(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_get_tier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_charge_audit(uuid, text, numeric, numeric, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mail_claim_address(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mail_directory_search(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mail_get_badges(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mail_list_my_addresses() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mail_send(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mail_send(text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resync_all_credit_lots() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_plan(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, numeric, text, jsonb) FROM PUBLIC, anon;

-- Trigger functions: not directly callable via API, but revoke anon EXECUTE to satisfy the linter.
REVOKE EXECUTE ON FUNCTION public.community_bookmarks_bump() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_follows_after_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_impressions_bump() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_likes_bump() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_lock_handle() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_posts_after_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_reposts_bump() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_lock_handle() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_plan_change() FROM PUBLIC, anon;
