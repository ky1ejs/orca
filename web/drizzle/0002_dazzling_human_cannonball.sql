CREATE TABLE `task_worktree` (
	`task_id` text PRIMARY KEY NOT NULL,
	`worktree_path` text NOT NULL,
	`branch_name` text NOT NULL,
	`base_branch` text NOT NULL,
	`repo_path` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
