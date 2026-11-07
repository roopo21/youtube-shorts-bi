CREATE TABLE public.ytshorts_coverage (
 key text PRIMARY KEY,label text NOT NULL,app_section text NOT NULL,source_strategy text NOT NULL,
 launch text NOT NULL,delivery_type text NOT NULL,note text NOT NULL,sort_order integer NOT NULL,verified boolean NOT NULL DEFAULT false
);
CREATE TABLE public.ytshorts_discovery (
 id text PRIMARY KEY CHECK(id ~ '^[A-Za-z0-9_-]{11}$'),title text NOT NULL,
 language text NOT NULL CHECK(language IN ('hi','mr')),topic text NOT NULL,
 coverage_key text NOT NULL REFERENCES public.ytshorts_coverage(key),channel_id text,channel_title text NOT NULL DEFAULT '',
 source_url text NOT NULL,short_url text NOT NULL,metadata_source text NOT NULL,language_source text NOT NULL,
 duration integer CHECK(duration BETWEEN 1 AND 180),status text NOT NULL CHECK(status IN ('candidate','experimental','rejected','promoted')),
 discovered_at bigint NOT NULL
);
CREATE INDEX ytshorts_discovery_feed_idx ON public.ytshorts_discovery(language,discovered_at) WHERE status='experimental';
CREATE INDEX ytshorts_discovery_coverage_idx ON public.ytshorts_discovery(coverage_key);
ALTER TABLE public.ytshorts_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ytshorts_discovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ytshorts_coverage,public.ytshorts_discovery FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ytshorts_coverage,public.ytshorts_discovery TO service_role;
