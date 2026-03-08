CREATE TABLE IF NOT EXISTS `auth_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`server_url` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `terminal_output_buffer` (
	`session_id` text NOT NULL,
	`chunk` blob NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`session_id`, `sequence`),
	FOREIGN KEY (`session_id`) REFERENCES `terminal_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `terminal_session` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`pid` integer,
	`status` text DEFAULT 'STARTING' NOT NULL,
	`working_directory` text,
	`started_at` text,
	`stopped_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
