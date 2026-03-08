CREATE TABLE `project_directory` (
	`project_id` text PRIMARY KEY NOT NULL,
	`directory` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
