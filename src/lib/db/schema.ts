import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("INR"),
  // One of the keys in src/lib/theme/palette.ts (or null = Fresh Ledger default).
  accent: text("accent"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    userId: text("user_id").references(() => users.id),
    email: text("email"),
    name: text("name").notNull(),
    avatar: text("avatar"),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("household_members_household_idx").on(table.householdId),
    uniqueIndex("household_members_household_user_unq").on(
      table.householdId,
      table.userId,
    ),
    uniqueIndex("household_members_household_email_unq").on(
      table.householdId,
      table.email,
    ),
    index("household_members_email_idx").on(table.email),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("receipt"),
    color: text("color").notNull().default("#6366f1"),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("categories_household_idx").on(table.householdId)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    memberId: text("member_id")
      .notNull()
      .references(() => householdMembers.id),
    // Integer minor units (fixed scale 100 — see src/lib/money.ts); exact SQL sums.
    amountMinor: integer("amount_minor").notNull(),
    description: text("description").notNull(),
    date: text("date").notNull(), // ISO date YYYY-MM-DD
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // Every dashboard/list query filters by household and usually a date range.
    index("expenses_household_date_idx").on(table.householdId, table.date),
    index("expenses_category_idx").on(table.categoryId),
    index("expenses_member_idx").on(table.memberId),
  ],
);

// Type exports
export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type NewCategory = typeof categories.$inferInsert;
export type NewHouseholdMember = typeof householdMembers.$inferInsert;
