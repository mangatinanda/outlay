import "../src/lib/db/init";
import { seed } from "../src/lib/db/seed";

seed().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
