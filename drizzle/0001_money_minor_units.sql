PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`category_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`description` text NOT NULL,
	`date` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `household_members`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_expenses` (`id`, `household_id`, `category_id`, `member_id`, `amount_minor`, `description`, `date`, `notes`, `created_at`, `updated_at`)
SELECT `id`, `household_id`, `category_id`, `member_id`, CAST(ROUND(`amount` * 100) AS INTEGER), `description`, `date`, `notes`, `created_at`, `updated_at` FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
