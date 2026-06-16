ALTER TABLE `household_members` ADD `email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_household_user_unq` ON `household_members` (`household_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_household_email_unq` ON `household_members` (`household_id`,`email`);--> statement-breakpoint
CREATE INDEX `household_members_email_idx` ON `household_members` (`email`);