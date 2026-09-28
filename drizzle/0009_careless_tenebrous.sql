CREATE TABLE `expense_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`member_id` text NOT NULL,
	`share_minor` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `household_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_splits_expense_member_uidx` ON `expense_splits` (`expense_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `expense_splits_member_idx` ON `expense_splits` (`member_id`);