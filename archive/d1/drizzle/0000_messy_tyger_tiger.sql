CREATE TABLE `impressions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`video_id` text NOT NULL,
	`language` text NOT NULL,
	`topic` text NOT NULL,
	`displayed` integer DEFAULT 0 NOT NULL,
	`watch_seconds` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `impressions_session_idx` ON `impressions` (`session_id`);--> statement-breakpoint
CREATE TABLE `refreshes` (
	`language` text PRIMARY KEY NOT NULL,
	`last_attempt` integer DEFAULT 0 NOT NULL,
	`last_success` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'never' NOT NULL,
	`message` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`language` text NOT NULL,
	`topic` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_title` text NOT NULL,
	`language` text,
	`audio_language` text,
	`topic` text NOT NULL,
	`duration` integer NOT NULL,
	`status` text NOT NULL,
	`published_at` text NOT NULL,
	`checked_at` integer NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `videos_feed_idx` ON `videos` (`language`,`status`,`topic`);