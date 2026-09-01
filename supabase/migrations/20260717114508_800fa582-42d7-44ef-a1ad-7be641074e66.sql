
-- Server-only privileged functions: revoke authenticated EXECUTE.
REVOKE EXECUTE ON FUNCTION public.award_founding_referral(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.award_founding_referral_by_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_bump_counter(uuid, text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_charge_audit(uuid, text, numeric, numeric, text, text, text, text, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resync_all_credit_lots() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_user_plan(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, numeric, text, jsonb) FROM authenticated;

-- Trigger functions: only fired by triggers, never directly.
REVOKE EXECUTE ON FUNCTION public.community_bookmarks_bump() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_follows_after_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_impressions_bump() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_likes_bump() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_lock_handle() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_posts_after_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.community_reposts_bump() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_plan_change() FROM authenticated;
