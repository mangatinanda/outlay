CREATE INDEX `categories_household_idx` ON `categories` (`household_id`);--> statement-breakpoint
CREATE INDEX `expenses_household_date_idx` ON `expenses` (`household_id`,`date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_member_idx` ON `expenses` (`member_id`);--> statement-breakpoint
CREATE INDEX `household_members_household_idx` ON `household_members` (`household_id`);