-- Add content categories and metadata provenance for the curated starter batch.
ALTER TABLE public.ytshorts_sources DROP CONSTRAINT ytshorts_sources_topic_check;
ALTER TABLE public.ytshorts_sources ADD CONSTRAINT ytshorts_sources_topic_check CHECK (topic IN ('skills','jobs','entertainment','brainrot','income','farming','construction','money','documents','food_stay'));
ALTER TABLE public.ytshorts_videos DROP CONSTRAINT ytshorts_videos_topic_check;
ALTER TABLE public.ytshorts_videos ADD CONSTRAINT ytshorts_videos_topic_check CHECK (topic IN ('skills','jobs','entertainment','brainrot','income','farming','construction','money','documents','food_stay'));
ALTER TABLE public.ytshorts_impressions DROP CONSTRAINT ytshorts_impressions_topic_check;
ALTER TABLE public.ytshorts_impressions ADD CONSTRAINT ytshorts_impressions_topic_check CHECK (topic IN ('skills','jobs','entertainment','brainrot','income','farming','construction','money','documents','food_stay'));
ALTER TABLE public.ytshorts_videos ADD COLUMN metadata_source text NOT NULL DEFAULT 'youtube_data_api';
ALTER TABLE public.ytshorts_videos ADD COLUMN language_source text NOT NULL DEFAULT 'youtube_audio_metadata';
ALTER TABLE public.ytshorts_videos ADD COLUMN source_url text;
