ALTER TABLE public.ytshorts_discovery DROP CONSTRAINT ytshorts_discovery_status_check;
ALTER TABLE public.ytshorts_discovery ADD CONSTRAINT ytshorts_discovery_status_check CHECK(status IN ('candidate','experimental','rejected','promoted','reserve'));
