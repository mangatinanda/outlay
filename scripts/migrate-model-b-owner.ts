import { migrateOwner } from "../src/lib/db/migrate-owner";

migrateOwner()
  .then(() => {
    console.log("Model B owner backfill complete.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
