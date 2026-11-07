-- Apply once to an existing database; the local server now defaults to a mixed feed.
ALTER TABLE public.ytshorts_sessions DROP CONSTRAINT ytshorts_sessions_language_check;
ALTER TABLE public.ytshorts_sessions ADD CONSTRAINT ytshorts_sessions_language_check CHECK(language IN ('hi','mr','mixed'));
