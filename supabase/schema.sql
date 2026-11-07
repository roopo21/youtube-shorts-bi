-- Applied through Supabase MCP after inspecting the project.
-- Prefixes avoid colliding with an app's existing tables.
-- All access is initially server-only. Never place a service-role key in the WebView.
-- Epoch timestamps remain milliseconds to match the current API contract.
CREATE TABLE public.ytshorts_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE public.ytshorts_sources (
  id text PRIMARY KEY,
  channel_id text NOT NULL,
  language text NOT NULL CHECK (language IN ('hi','mr')),
  topic text NOT NULL CHECK (topic IN ('skills','jobs','entertainment')),
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (channel_id, language)
);
CREATE TABLE public.ytshorts_videos (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{11}$'),
  title text NOT NULL,
  channel_id text NOT NULL,
  channel_title text NOT NULL,
  language text CHECK (language IN ('hi','mr')),
  audio_language text,
  topic text NOT NULL CHECK (topic IN ('skills','jobs','entertainment')),
  duration integer NOT NULL CHECK (duration >= 0),
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  published_at timestamptz NOT NULL,
  checked_at bigint NOT NULL,
  reason text NOT NULL,
  CHECK (status <> 'approved' OR (language IS NOT NULL AND duration BETWEEN 1 AND 180))
);
CREATE INDEX ytshorts_videos_feed_idx ON public.ytshorts_videos (language, published_at DESC) WHERE status = 'approved';
CREATE INDEX ytshorts_videos_expiry_idx ON public.ytshorts_videos (checked_at);
CREATE TABLE public.ytshorts_refreshes (
  language text PRIMARY KEY CHECK (language IN ('hi','mr')),
  last_attempt bigint NOT NULL DEFAULT 0,
  last_success bigint NOT NULL DEFAULT 0,
  lease_until bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'never' CHECK (status IN ('never','running','ready','failed')),
  message text NOT NULL DEFAULT ''
);
CREATE TABLE public.ytshorts_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language text NOT NULL CHECK (language IN ('hi','mr')),
  created_at bigint NOT NULL
);
CREATE INDEX ytshorts_sessions_expiry_idx ON public.ytshorts_sessions (created_at);
CREATE TABLE public.ytshorts_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  video_id text NOT NULL,
  language text NOT NULL CHECK (language IN ('hi','mr')),
  topic text NOT NULL CHECK (topic IN ('skills','jobs','entertainment')),
  displayed boolean NOT NULL DEFAULT false,
  watch_seconds integer NOT NULL DEFAULT 0 CHECK (watch_seconds BETWEEN 0 AND 600),
  completed boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL
);
-- IDs intentionally have no foreign keys: catalogue and session retention are independent.
CREATE INDEX ytshorts_impressions_session_idx ON public.ytshorts_impressions (session_id, created_at, video_id);
CREATE INDEX ytshorts_impressions_expiry_idx ON public.ytshorts_impressions (created_at);

ALTER TABLE public.ytshorts_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytshorts_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytshorts_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytshorts_refreshes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytshorts_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytshorts_impressions ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: browser clients go through the backend API.
REVOKE ALL ON TABLE public.ytshorts_settings, public.ytshorts_sources,
  public.ytshorts_videos, public.ytshorts_refreshes,
  public.ytshorts_sessions, public.ytshorts_impressions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ytshorts_settings,
  public.ytshorts_sources, public.ytshorts_videos, public.ytshorts_refreshes,
  public.ytshorts_sessions, public.ytshorts_impressions TO service_role;

-- Only service-role execution is permitted. The Edge Function checks its scoped token first.
CREATE FUNCTION public.ytshorts_data_operation(p_operation text, p_args jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE v_result jsonb; v_item jsonb; v_batch jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_args) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Arguments must be an array'; END IF;
  IF p_operation = 'batch' THEN
    IF jsonb_array_length(p_args) > 200 THEN RAISE EXCEPTION 'Batch too large'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_args) LOOP
      IF v_item->>'op' = 'batch' THEN RAISE EXCEPTION 'Nested batches are not allowed'; END IF;
      v_batch := v_batch || jsonb_build_array(public.ytshorts_data_operation(v_item->>'op',v_item->'args'));
    END LOOP;
    RETURN jsonb_build_object('results',v_batch);
  END IF;
  CASE p_operation
    WHEN 'setting_get' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT value FROM public.ytshorts_settings WHERE key=(p_args->>0)::text) AS result;
    WHEN 'refresh_claim' THEN
      IF jsonb_array_length(p_args) <> 5 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_refreshes(language,last_attempt,lease_until,status,message) VALUES((p_args->>0)::text,(p_args->>1)::bigint,(p_args->>2)::bigint,'running','') ON CONFLICT(language) DO UPDATE SET last_attempt=excluded.last_attempt,lease_until=excluded.lease_until,status='running',message='' WHERE ytshorts_refreshes.lease_until < (p_args->>3)::bigint AND ytshorts_refreshes.last_attempt < (p_args->>4)::bigint RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'impressions_expire' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (DELETE FROM public.ytshorts_impressions WHERE id IN (SELECT id FROM public.ytshorts_impressions WHERE created_at < (p_args->>0)::bigint LIMIT 1000) RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'sessions_expire' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (DELETE FROM public.ytshorts_sessions WHERE id IN (SELECT id FROM public.ytshorts_sessions WHERE created_at < (p_args->>0)::bigint LIMIT 1000) RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'videos_expire' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (DELETE FROM public.ytshorts_videos WHERE id IN (SELECT id FROM public.ytshorts_videos WHERE checked_at < (p_args->>0)::bigint LIMIT 1000) RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'sources_enabled' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_sources WHERE language=(p_args->>0)::text AND enabled=true ORDER BY id LIMIT 3) AS result;
    WHEN 'video_audio_conflict' THEN
      IF jsonb_array_length(p_args) <> 4 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_videos SET status='rejected',reason='audio_language_changed',audio_language=(p_args->>0)::text,checked_at=(p_args->>1)::bigint WHERE id=(p_args->>2)::text AND language IS NOT NULL AND language!=(p_args->>3)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'video_upsert' THEN
      IF jsonb_array_length(p_args) <> 12 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_videos(id,title,channel_id,channel_title,language,audio_language,topic,duration,status,published_at,checked_at,reason) VALUES((p_args->>0)::text,(p_args->>1)::text,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::text,(p_args->>5)::text,(p_args->>6)::text,(p_args->>7)::integer,(p_args->>8)::text,(p_args->>9)::timestamptz,(p_args->>10)::bigint,(p_args->>11)::text) ON CONFLICT(id) DO UPDATE SET title=excluded.title,channel_title=excluded.channel_title,audio_language=excluded.audio_language,duration=excluded.duration,published_at=excluded.published_at,checked_at=excluded.checked_at,language=CASE WHEN ytshorts_videos.reason='human_reviewed' AND excluded.status!='rejected' THEN ytshorts_videos.language ELSE excluded.language END,topic=CASE WHEN ytshorts_videos.reason='human_reviewed' THEN ytshorts_videos.topic ELSE excluded.topic END,status=CASE WHEN ytshorts_videos.reason='human_rejected' THEN 'rejected' WHEN ytshorts_videos.reason='human_reviewed' AND excluded.status!='rejected' AND (excluded.language IS NULL OR excluded.language=ytshorts_videos.language) THEN ytshorts_videos.status ELSE excluded.status END,reason=CASE WHEN ytshorts_videos.reason='human_rejected' THEN 'human_rejected' WHEN ytshorts_videos.reason='human_reviewed' AND excluded.status!='rejected' AND (excluded.language IS NULL OR excluded.language=ytshorts_videos.language) THEN ytshorts_videos.reason ELSE excluded.reason END RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'refresh_success' THEN
      IF jsonb_array_length(p_args) <> 3 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_refreshes SET last_success=(p_args->>0)::bigint,lease_until=0,status='ready',message=(p_args->>1)::text WHERE language=(p_args->>2)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'refresh_failure' THEN
      IF jsonb_array_length(p_args) <> 2 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_refreshes SET lease_until=0,status='failed',message=(p_args->>0)::text WHERE language=(p_args->>1)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'session_get' THEN
      IF jsonb_array_length(p_args) <> 2 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_sessions WHERE id=(p_args->>0)::uuid AND created_at>(p_args->>1)::bigint) AS result;
    WHEN 'session_insert' THEN
      IF jsonb_array_length(p_args) <> 3 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_sessions(id,language,created_at) VALUES((p_args->>0)::uuid,(p_args->>1)::text,(p_args->>2)::bigint) RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'feed_catalogue' THEN
      IF jsonb_array_length(p_args) <> 2 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT id,title,topic,duration,language FROM public.ytshorts_videos WHERE status='approved' AND language=(p_args->>0)::text AND checked_at>(p_args->>1)::bigint ORDER BY published_at DESC LIMIT 300) AS result;
    WHEN 'session_seen' THEN
      IF jsonb_array_length(p_args) <> 2 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT DISTINCT video_id FROM public.ytshorts_impressions WHERE session_id=(p_args->>0)::uuid AND displayed=true AND created_at>(p_args->>1)::bigint) AS result;
    WHEN 'impression_insert' THEN
      IF jsonb_array_length(p_args) <> 6 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_impressions(id,session_id,video_id,language,topic,created_at) VALUES((p_args->>0)::uuid,(p_args->>1)::uuid,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::text,(p_args->>5)::bigint) RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'refresh_status' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT last_success,status,message FROM public.ytshorts_refreshes WHERE language=(p_args->>0)::text) AS result;
    WHEN 'impression_get' THEN
      IF jsonb_array_length(p_args) <> 3 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT i.*,v.duration FROM public.ytshorts_impressions i JOIN public.ytshorts_videos v ON v.id=i.video_id WHERE i.id=(p_args->>0)::uuid AND i.session_id=(p_args->>1)::uuid AND i.created_at>(p_args->>2)::bigint) AS result;
    WHEN 'impression_progress' THEN
      IF jsonb_array_length(p_args) <> 3 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_impressions SET displayed=true,watch_seconds=GREATEST(watch_seconds,(p_args->>0)::integer),completed=GREATEST(completed,((p_args->>1)::integer=1)) WHERE id=(p_args->>2)::uuid RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'sources_all' THEN
      IF jsonb_array_length(p_args) <> 0 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_sources ORDER BY language,topic) AS result;
    WHEN 'refreshes_all' THEN
      IF jsonb_array_length(p_args) <> 0 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_refreshes) AS result;
    WHEN 'catalogue_counts' THEN
      IF jsonb_array_length(p_args) <> 0 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT language,status,COUNT(*) AS count FROM public.ytshorts_videos GROUP BY language,status) AS result;
    WHEN 'interest_metrics' THEN
      IF jsonb_array_length(p_args) <> 0 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT language,topic,COUNT(*) AS impressions,SUM(watch_seconds) AS watch_seconds,SUM(completed::integer) AS completions FROM public.ytshorts_impressions WHERE displayed=true GROUP BY language,topic) AS result;
    WHEN 'setting_put' THEN
      IF jsonb_array_length(p_args) <> 2 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_settings(key,value) VALUES((p_args->>0)::text,(p_args->>1)::text) ON CONFLICT(key) DO UPDATE SET value=excluded.value RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'sources_count' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT COUNT(*) AS n FROM public.ytshorts_sources WHERE language=(p_args->>0)::text AND enabled=true) AS result;
    WHEN 'source_exists' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT id FROM public.ytshorts_sources WHERE id=(p_args->>0)::text) AS result;
    WHEN 'source_enabled' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT enabled FROM public.ytshorts_sources WHERE id=(p_args->>0)::text) AS result;
    WHEN 'source_upsert' THEN
      IF jsonb_array_length(p_args) <> 5 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_sources(id,channel_id,language,topic,label,enabled) VALUES((p_args->>0)::text,(p_args->>1)::text,(p_args->>2)::text,(p_args->>3)::text,(p_args->>4)::text,true) ON CONFLICT(id) DO UPDATE SET topic=excluded.topic,label=excluded.label,enabled=true RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'source_get' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_sources WHERE id=(p_args->>0)::text) AS result;
    WHEN 'source_disable' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_sources SET enabled=false WHERE id=(p_args->>0)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'source_unpublish' THEN
      IF jsonb_array_length(p_args) <> 2 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_videos SET status='pending',reason='source_disabled' WHERE channel_id=(p_args->>0)::text AND language=(p_args->>1)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'candidates' THEN
      IF jsonb_array_length(p_args) <> 0 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_videos WHERE status='pending' ORDER BY checked_at DESC LIMIT 100) AS result;
    WHEN 'video_get' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT * FROM public.ytshorts_videos WHERE id=(p_args->>0)::text) AS result;
    WHEN 'video_reject' THEN
      IF jsonb_array_length(p_args) <> 1 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_videos SET status='rejected',reason='human_rejected' WHERE id=(p_args->>0)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'video_approve' THEN
      IF jsonb_array_length(p_args) <> 3 THEN RAISE EXCEPTION 'Invalid argument count'; END IF;
      WITH changed AS (UPDATE public.ytshorts_videos SET status='approved',language=(p_args->>0)::text,topic=(p_args->>1)::text,reason='human_reviewed' WHERE id=(p_args->>2)::text RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    ELSE RAISE EXCEPTION 'Unknown feed operation';
  END CASE;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.ytshorts_data_operation(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ytshorts_data_operation(text,jsonb) TO service_role;
