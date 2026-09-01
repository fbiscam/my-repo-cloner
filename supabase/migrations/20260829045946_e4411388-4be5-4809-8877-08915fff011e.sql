CREATE OR REPLACE FUNCTION public.community_follows_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, body, data)
  VALUES (NEW.followee_id, 'community_follow', 'You have a new follower', '',
          jsonb_build_object(
            'actor_id', NEW.follower_id,
            'url', '/dashboard/community/u/' || COALESCE((SELECT handle::text FROM public.community_profiles WHERE user_id = NEW.follower_id), '')
          ));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.community_likes_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.community_bump_counter(NEW.post_id, 'like_count', 1);
    SELECT author_id INTO _author FROM public.community_posts WHERE id = NEW.post_id;
    IF _author IS NOT NULL AND _author <> NEW.user_id THEN
      INSERT INTO public.user_notifications (user_id, type, title, body, data)
      VALUES (_author, 'community_like', 'Someone liked your post', '',
              jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id,
                                 'url', '/dashboard/community/post/' || NEW.post_id::text));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.community_bump_counter(OLD.post_id, 'like_count', -1);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.community_posts_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _parent_author UUID;
BEGIN
  IF NEW.parent_post_id IS NOT NULL THEN
    UPDATE public.community_posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_post_id;
    SELECT author_id INTO _parent_author FROM public.community_posts WHERE id = NEW.parent_post_id;
    IF _parent_author IS NOT NULL AND _parent_author <> NEW.author_id THEN
      INSERT INTO public.user_notifications (user_id, type, title, body, data)
      VALUES (_parent_author, 'community_reply', 'New reply to your post', left(NEW.body, 140),
              jsonb_build_object('post_id', NEW.parent_post_id, 'reply_id', NEW.id, 'actor_id', NEW.author_id,
                                 'url', '/dashboard/community/post/' || NEW.parent_post_id::text));
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.expire_pro_trials()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row record; _remaining numeric; _new_balance numeric; _count integer := 0;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.user_subscriptions
     WHERE is_trial = true AND trial_ends_at IS NOT NULL AND trial_ends_at <= now()
  LOOP
    DELETE FROM public.user_subscriptions WHERE user_id = _row.user_id AND is_trial = true;

    SELECT COALESCE(SUM(amount_remaining), 0) INTO _remaining
      FROM public.credit_lots
     WHERE user_id = _row.user_id AND reason = 'pro_trial_grant' AND amount_remaining > 0;

    IF _remaining > 0 THEN
      UPDATE public.credit_lots SET amount_remaining = 0
       WHERE user_id = _row.user_id AND reason = 'pro_trial_grant' AND amount_remaining > 0;
      UPDATE public.credit_balances
         SET balance = GREATEST(0, balance - _remaining), monthly_allowance = 0, updated_at = now()
       WHERE user_id = _row.user_id
       RETURNING balance INTO _new_balance;
      INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
      VALUES (_row.user_id, -_remaining, 'trial_expired', '{}'::jsonb, COALESCE(_new_balance, 0));
    ELSE
      UPDATE public.credit_balances SET monthly_allowance = 0, updated_at = now() WHERE user_id = _row.user_id;
    END IF;

    INSERT INTO public.user_notifications (user_id, type, title, body, data)
    VALUES (_row.user_id, 'trial_expired', 'Your 14-day Pro trial has ended',
            'Upgrade to Pro to keep realtime alerts, the full ICT engine and your scan credits.',
            jsonb_build_object('url', '/dashboard/billing'));

    _count := _count + 1;
  END LOOP;
  RETURN _count;
END; $$;