-- extensions & enums
CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  CREATE TYPE public.community_report_status AS ENUM ('open','reviewed','actioned','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.community_verified_tier AS ENUM ('gold','blue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- community_profiles
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.community_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle CITEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT CHECK (char_length(bio) <= 160),
  cover_url TEXT,
  location TEXT CHECK (char_length(location) <= 60),
  website TEXT CHECK (char_length(website) <= 200),
  handle_locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_profiles TO authenticated;
GRANT ALL ON public.community_profiles TO service_role;
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY cp_read_all ON public.community_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY cp_insert_own ON public.community_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY cp_update_own ON public.community_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cp_admin_all ON public.community_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_cp_updated_at BEFORE UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.community_lock_handle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.handle IS DISTINCT FROM OLD.handle THEN
    IF NOT public.has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'handle is locked' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cp_lock_handle BEFORE UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public.community_lock_handle();

-- =========================================================================
-- community_blocks (must exist before posts policy references it)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.community_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_blocks TO authenticated;
GRANT ALL ON public.community_blocks TO service_role;
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocks_own ON public.community_blocks FOR ALL TO authenticated
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- =========================================================================
-- community_posts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) <= 500),
  media_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
  attached_signal_id UUID,
  cashtags TEXT[] NOT NULL DEFAULT '{}'::text[],
  parent_post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  like_count INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  repost_count INT NOT NULL DEFAULT 0,
  bookmark_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (array_length(media_urls,1) IS NULL OR array_length(media_urls,1) <= 4)
);
CREATE INDEX IF NOT EXISTS idx_cposts_author ON public.community_posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cposts_parent ON public.community_posts(parent_post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_cposts_created ON public.community_posts(created_at DESC) WHERE deleted_at IS NULL AND parent_post_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cposts_cashtags ON public.community_posts USING GIN(cashtags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT ALL ON public.community_posts TO service_role;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_read ON public.community_posts FOR SELECT TO authenticated USING (
  deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.community_blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = author_id)
  AND NOT EXISTS (SELECT 1 FROM public.community_blocks b WHERE b.blocker_id = author_id AND b.blocked_id = auth.uid())
);
CREATE POLICY posts_insert_own ON public.community_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY posts_update_own ON public.community_posts FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY posts_delete_own ON public.community_posts FOR DELETE TO authenticated USING (author_id = auth.uid());
CREATE POLICY posts_admin_all ON public.community_posts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_cposts_updated_at BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- likes / reposts / bookmarks / impressions / follows
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.community_likes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_clikes_post ON public.community_likes(post_id);
GRANT SELECT, INSERT, DELETE ON public.community_likes TO authenticated;
GRANT ALL ON public.community_likes TO service_role;
ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY likes_read ON public.community_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY likes_write_own ON public.community_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY likes_delete_own ON public.community_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.community_reposts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_creposts_post ON public.community_reposts(post_id);
GRANT SELECT, INSERT, DELETE ON public.community_reposts TO authenticated;
GRANT ALL ON public.community_reposts TO service_role;
ALTER TABLE public.community_reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY reposts_read ON public.community_reposts FOR SELECT TO authenticated USING (true);
CREATE POLICY reposts_write_own ON public.community_reposts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY reposts_delete_own ON public.community_reposts FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.community_bookmarks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_bookmarks TO authenticated;
GRANT ALL ON public.community_bookmarks TO service_role;
ALTER TABLE public.community_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookmarks_read_own ON public.community_bookmarks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY bookmarks_write_own ON public.community_bookmarks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY bookmarks_delete_own ON public.community_bookmarks FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.community_impressions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT ON public.community_impressions TO authenticated;
GRANT ALL ON public.community_impressions TO service_role;
ALTER TABLE public.community_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY imp_read_own ON public.community_impressions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY imp_write_own ON public.community_impressions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.community_follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS idx_cfollows_followee ON public.community_follows(followee_id);
GRANT SELECT, INSERT, DELETE ON public.community_follows TO authenticated;
GRANT ALL ON public.community_follows TO service_role;
ALTER TABLE public.community_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY follows_read ON public.community_follows FOR SELECT TO authenticated USING (true);
CREATE POLICY follows_write_own ON public.community_follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete_own ON public.community_follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- =========================================================================
-- reports & verified override
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) <= 500),
  status public.community_report_status NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolver_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL) OR (profile_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_insert_own ON public.community_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_read_admin ON public.community_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR reporter_id = auth.uid());
CREATE POLICY reports_update_admin ON public.community_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_creports_updated_at BEFORE UPDATE ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.community_verified_override (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.community_verified_tier NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_verified_override TO authenticated;
GRANT ALL ON public.community_verified_override TO service_role;
ALTER TABLE public.community_verified_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY cvo_read_all ON public.community_verified_override FOR SELECT TO authenticated USING (true);
CREATE POLICY cvo_admin_write ON public.community_verified_override FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- counter triggers
-- =========================================================================
CREATE OR REPLACE FUNCTION public.community_bump_counter(_post_id UUID, _col TEXT, _delta INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE format('UPDATE public.community_posts SET %I = GREATEST(0, %I + $1) WHERE id = $2', _col, _col)
    USING _delta, _post_id;
END $$;

CREATE OR REPLACE FUNCTION public.community_likes_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.community_bump_counter(NEW.post_id, 'like_count', 1);
    SELECT author_id INTO _author FROM public.community_posts WHERE id = NEW.post_id;
    IF _author IS NOT NULL AND _author <> NEW.user_id THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, url, meta)
      VALUES (_author, 'community_like', 'Someone liked your post', '', '/dashboard/community/post/' || NEW.post_id::text,
              jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.community_bump_counter(OLD.post_id, 'like_count', -1);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_clikes_counter AFTER INSERT OR DELETE ON public.community_likes
  FOR EACH ROW EXECUTE FUNCTION public.community_likes_bump();

CREATE OR REPLACE FUNCTION public.community_reposts_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN PERFORM public.community_bump_counter(NEW.post_id, 'repost_count', 1); RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN PERFORM public.community_bump_counter(OLD.post_id, 'repost_count', -1); RETURN OLD;
  END IF; RETURN NULL;
END $$;
CREATE TRIGGER trg_creposts_counter AFTER INSERT OR DELETE ON public.community_reposts
  FOR EACH ROW EXECUTE FUNCTION public.community_reposts_bump();

CREATE OR REPLACE FUNCTION public.community_bookmarks_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN PERFORM public.community_bump_counter(NEW.post_id, 'bookmark_count', 1); RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN PERFORM public.community_bump_counter(OLD.post_id, 'bookmark_count', -1); RETURN OLD;
  END IF; RETURN NULL;
END $$;
CREATE TRIGGER trg_cbookmarks_counter AFTER INSERT OR DELETE ON public.community_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.community_bookmarks_bump();

CREATE OR REPLACE FUNCTION public.community_impressions_bump()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.community_bump_counter(NEW.post_id, 'view_count', 1);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cimp_counter AFTER INSERT ON public.community_impressions
  FOR EACH ROW EXECUTE FUNCTION public.community_impressions_bump();

CREATE OR REPLACE FUNCTION public.community_posts_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _parent_author UUID;
BEGIN
  IF NEW.parent_post_id IS NOT NULL THEN
    UPDATE public.community_posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_post_id;
    SELECT author_id INTO _parent_author FROM public.community_posts WHERE id = NEW.parent_post_id;
    IF _parent_author IS NOT NULL AND _parent_author <> NEW.author_id THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, url, meta)
      VALUES (_parent_author, 'community_reply', 'New reply to your post', left(NEW.body, 140),
              '/dashboard/community/post/' || NEW.parent_post_id::text,
              jsonb_build_object('post_id', NEW.parent_post_id, 'reply_id', NEW.id, 'actor_id', NEW.author_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cposts_after_insert AFTER INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_posts_after_insert();

CREATE OR REPLACE FUNCTION public.community_follows_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_notifications (user_id, kind, title, body, url, meta)
  VALUES (NEW.followee_id, 'community_follow', 'You have a new follower', '',
          '/dashboard/community/u/' || COALESCE((SELECT handle::text FROM public.community_profiles WHERE user_id = NEW.follower_id), ''),
          jsonb_build_object('actor_id', NEW.follower_id));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cfollows_after_insert AFTER INSERT ON public.community_follows
  FOR EACH ROW EXECUTE FUNCTION public.community_follows_after_insert();

-- verified tier resolver
CREATE OR REPLACE FUNCTION public.community_get_tier(_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN 'gold'
    WHEN EXISTS (SELECT 1 FROM public.community_verified_override WHERE user_id = _user_id AND tier = 'gold') THEN 'gold'
    WHEN EXISTS (SELECT 1 FROM public.community_verified_override WHERE user_id = _user_id AND tier = 'blue') THEN 'blue'
    WHEN EXISTS (
      SELECT 1 FROM public.founding_applications fa
      JOIN auth.users au ON lower(au.email) = lower(fa.email)
      WHERE au.id = _user_id
        AND (fa.document_status IN ('approved','verified') OR fa.status IN ('approved','graduated','active'))
    ) THEN 'blue'
    ELSE NULL
  END;
$$;

-- realtime for feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;