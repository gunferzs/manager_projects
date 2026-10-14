import { getRuntimeDb } from "../src/lib/db/client";

const db = getRuntimeDb();
db.prepare("UPDATE projects SET name = ?, slug = ?, updated_at = ? WHERE id = 1").run(
  "gas_finder",
  "gas-finder",
  new Date().toISOString(),
);
console.log(db.prepare("SELECT id, slug, name, compose_project, compose_file FROM projects WHERE id = 1").get());
