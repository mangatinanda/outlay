import { db } from "./index";
import { households, householdMembers, categories, expenses } from "./schema";
import { createId } from "@paralleldrive/cuid2";
import { DEFAULT_CATEGORIES } from "./default-categories";

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
    { description: "Weekly groceries", amount: 85.50, categoryName: "Groceries", daysAgo: 1 },
    { description: "Electric bill", amount: 120.00, categoryName: "Utilities", daysAgo: 3 },
    { description: "Gas station", amount: 45.00, categoryName: "Transportation", daysAgo: 2 },
    { description: "Pizza night", amount: 32.00, categoryName: "Dining Out", daysAgo: 4 },
    { description: "Netflix subscription", amount: 15.99, categoryName: "Subscriptions", daysAgo: 5 },
    { description: "Pharmacy", amount: 28.50, categoryName: "Healthcare", daysAgo: 6 },
    { description: "Movie tickets", amount: 24.00, categoryName: "Entertainment", daysAgo: 7 },
    { description: "New shoes", amount: 79.99, categoryName: "Shopping", daysAgo: 8 },
    { description: "Organic produce", amount: 62.30, categoryName: "Groceries", daysAgo: 10 },
    { description: "Water bill", amount: 45.00, categoryName: "Utilities", daysAgo: 12 },
    { description: "Bus pass", amount: 75.00, categoryName: "Transportation", daysAgo: 14 },
    { description: "Sushi dinner", amount: 55.00, categoryName: "Dining Out", daysAgo: 15 },
    { description: "Rent payment", amount: 1500.00, categoryName: "Rent/Mortgage", daysAgo: 1 },
    { description: "Spotify", amount: 9.99, categoryName: "Subscriptions", daysAgo: 20 },
    { description: "Car insurance", amount: 150.00, categoryName: "Insurance", daysAgo: 25 },
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
      amount: exp.amount,
      description: exp.description,
      date: date.toISOString().split("T")[0],
    });
  }

  console.log("Database seeded successfully!");
}
