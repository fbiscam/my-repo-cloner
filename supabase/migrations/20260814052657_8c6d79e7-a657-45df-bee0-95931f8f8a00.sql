DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.award_founding_referral(uuid)',
    'public.award_founding_referral_by_user(uuid)',
    'public.bug_notify_dispatch(text,text,bigint)',
    'public.community_bump_counter(uuid,text,integer)',
    'public.community_get_tier(uuid)',
    'public.convert_referral(uuid)',
    'public.delete_email(text,bigint)',
    'public.email_queue_dispatch()',
    'public.enqueue_email(text,jsonb)',
    'public.expire_credits()',
    'public.expire_pro_trials()',
    'public.grant_credits(uuid,numeric,text,jsonb)',
    'public.grant_monthly_credits()',
    'public.lg_charge_credits(uuid,text,numeric,text,jsonb)',
    'public.log_charge_audit(uuid,text,numeric,numeric,text,text,text,text,text,text,jsonb)',
    'public.mail_system_send(text,uuid,text,text)',
    'public.move_to_dlq(text,text,bigint,jsonb)',
    'public.read_email_batch(text,integer,integer)',
    'public.resync_all_credit_lots()',
    'public.revoke_pro_trial(uuid,text)',
    'public.set_user_plan(uuid,text,text)',
    'public.spend_credits(uuid,numeric,text,jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;