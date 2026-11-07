CREATE OR REPLACE FUNCTION public.ytshorts_data_operation(p_operation text, p_args jsonb DEFAULT '[]'::jsonb)
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
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (
        SELECT * FROM (
          SELECT id,title,topic,duration,language FROM public.ytshorts_videos WHERE status='approved' AND language=p_args->>0 AND checked_at>(p_args->>1)::bigint
          UNION ALL
          SELECT d.id,d.title,d.topic,COALESCE(d.duration,0),d.language FROM public.ytshorts_discovery d WHERE d.status='experimental' AND d.language=p_args->>0 AND d.discovered_at>(p_args->>1)::bigint AND NOT EXISTS(SELECT 1 FROM public.ytshorts_videos v WHERE v.id=d.id)
        ) pool ORDER BY random() LIMIT 1000
      ) result;
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
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb),'changes',0) INTO v_result FROM (
       SELECT i.*,COALESCE(v.duration,d.duration,0) AS duration FROM public.ytshorts_impressions i LEFT JOIN public.ytshorts_videos v ON v.id=i.video_id LEFT JOIN public.ytshorts_discovery d ON d.id=i.video_id
       WHERE i.id=(p_args->>0)::uuid AND i.session_id=(p_args->>1)::uuid AND i.created_at>(p_args->>2)::bigint
      ) result;
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
    WHEN 'discovery_duration' THEN
      WITH changed AS (UPDATE public.ytshorts_discovery SET duration=(p_args->>1)::integer WHERE id=p_args->>0 AND duration IS NULL AND (p_args->>1)::integer BETWEEN 1 AND 180 RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',COUNT(*)) INTO v_result FROM changed;
    WHEN 'discovery_counts' THEN
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT language,topic,status,count(*) AS videos FROM public.ytshorts_discovery GROUP BY language,topic,status) r;
    WHEN 'coverage_status' THEN
      SELECT jsonb_build_object('rows',COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb),'changes',0) INTO v_result FROM (SELECT c.*,count(d.id) AS sourced FROM public.ytshorts_coverage c LEFT JOIN public.ytshorts_discovery d ON d.coverage_key=c.key GROUP BY c.key ORDER BY c.sort_order) r;
    WHEN 'discovery_import' THEN
      IF jsonb_array_length(p_args)>100 THEN RAISE EXCEPTION 'Import batch too large'; END IF;
      WITH changed AS (INSERT INTO public.ytshorts_discovery(id,title,language,topic,coverage_key,channel_id,channel_title,source_url,short_url,metadata_source,language_source,duration,status,discovered_at)
       SELECT id,title,language,topic,coverage_key,channel_id,channel_title,source_url,short_url,metadata_source,language_source,duration,status,discovered_at
       FROM jsonb_to_recordset(p_args) AS x(id text,title text,language text,topic text,coverage_key text,channel_id text,channel_title text,source_url text,short_url text,metadata_source text,language_source text,duration integer,status text,discovered_at bigint)
       ON CONFLICT(id) DO NOTHING RETURNING 1) SELECT jsonb_build_object('rows','[]'::jsonb,'changes',count(*)) INTO v_result FROM changed;
    ELSE RAISE EXCEPTION 'Unknown feed operation';
  END CASE;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.ytshorts_data_operation(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ytshorts_data_operation(text,jsonb) TO service_role;
