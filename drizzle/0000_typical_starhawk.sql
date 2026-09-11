CREATE TABLE `ai_usage` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`calls` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_type` text NOT NULL,
	`title` text NOT NULL,
	`portion` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real,
	`carbs` real,
	`fat` real,
	`notes` text NOT NULL,
	`source` text NOT NULL,
	`image_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_meals_user_date` ON `meals` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`calorie_goal` integer
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_type` text NOT NULL,
	`name` text NOT NULL
);
