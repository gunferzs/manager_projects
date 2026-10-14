import Database from "better-sqlite3";

const db = new Database("data/manager.sqlite");
const exists = db
  .prepare("SELECT id FROM project_services WHERE project_id = 2 AND name = 'app'")
  .get();
if (!exists) {
  db.prepare(
    `INSERT INTO project_services (
      project_id, name, container_name, host_port, health_kind, health_path, is_primary, is_ui
    ) VALUES (2, 'app', 'employee_team_manager_app', 3000, 'http', '/', 1, 1)`,
  ).run();
  console.log("inserted app service");
} else {
  console.log("app already exists", exists);
}
console.log(
  db
    .prepare(
      "SELECT name, host_port, is_primary, is_ui FROM project_services WHERE project_id = 2",
    )
    .all(),
);
db.close();
