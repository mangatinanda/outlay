import { createId } from "@paralleldrive/cuid2";
import { toMinorUnits } from "../money";
import { DEFAULT_CATEGORIES } from "./default-categories";
import { db } from "./index";
import { categories, expenses, householdMembers, households } from "./schema";

export async function seed() {
  // Check if already seeded
  const existing = await db.select().from(households).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded.");
    return;
  }

  const householdId = createId();
  const memberId = createId();

  // Create default household
  await db.insert(households).values({
    id: householdId,
    name: "My Home",
    currency: "INR",
  });

  // Create default member
  await db.insert(householdMembers).values({
    id: memberId,
    householdId,
    name: "Me",
    role: "admin",
  });

  // Create default categories
  for (const cat of DEFAULT_CATEGORIES) {
    await db.insert(categories).values({
      id: createId(),
      householdId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
    });
  }

  // Add sample expenses
  const cats = await db.select().from(categories);
  const sampleExpenses = [
    {
      description: "Weekly groceries",
      amount: 85.5,
      categoryName: "Groceries",
      daysAgo: 1,
    },
    {
      description: "Electric bill",
      amount: 120.0,
      categoryName: "Utilities",
      daysAgo: 3,
    },
    {
      description: "Gas station",
      amount: 45.0,
      categoryName: "Transportation",
      daysAgo: 2,
    },
    {
      description: "Pizza night",
      amount: 32.0,
      categoryName: "Dining Out",
      daysAgo: 4,
    },
    {
      description: "Netflix subscription",
      amount: 15.99,
      categoryName: "Subscriptions",
      daysAgo: 5,
    },
    {
      description: "Pharmacy",
      amount: 28.5,
      categoryName: "Healthcare",
      daysAgo: 6,
    },
    {
      description: "Movie tickets",
      amount: 24.0,
      categoryName: "Entertainment",
      daysAgo: 7,
    },
    {
      description: "New shoes",
      amount: 79.99,
      categoryName: "Shopping",
      daysAgo: 8,
    },
    {
      description: "Organic produce",
      amount: 62.3,
      categoryName: "Groceries",
      daysAgo: 10,
    },
    {
      description: "Water bill",
      amount: 45.0,
      categoryName: "Utilities",
      daysAgo: 12,
    },
    {
      description: "Bus pass",
      amount: 75.0,
      categoryName: "Transportation",
      daysAgo: 14,
    },
    {
      description: "Sushi dinner",
      amount: 55.0,
      categoryName: "Dining Out",
      daysAgo: 15,
    },
    {
      description: "Rent payment",
      amount: 1500.0,
      categoryName: "Rent/Mortgage",
      daysAgo: 1,
    },
    {
      description: "Spotify",
      amount: 9.99,
      categoryName: "Subscriptions",
      daysAgo: 20,
    },
    {
      description: "Car insurance",
      amount: 150.0,
      categoryName: "Insurance",
      daysAgo: 25,
    },
  ];

  for (const exp of sampleExpenses) {
    const cat = cats.find((c) => c.name === exp.categoryName);
    if (!cat) continue;
    const date = new Date();
    date.setDate(date.getDate() - exp.daysAgo);
    await db.insert(expenses).values({
      id: createId(),
      householdId,
      categoryId: cat.id,
      memberId,
      amountMinor: toMinorUnits(exp.amount),
      description: exp.description,
      // Local calendar date, not UTC (toISOString shifts the day east of UTC).
      date: date.toLocaleDateString("en-CA"),
    });
  }

  console.log("Database seeded successfully!");
}
