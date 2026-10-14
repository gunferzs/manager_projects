import Database from "better-sqlite3";

const db = new Database("data/manager.sqlite");
db.prepare(
  `UPDATE project_services
   SET health_kind = 'tcp', health_path = NULL
   WHERE project_id = 2 AND name = 'postgres'`,
).run();
db.prepare(
  `UPDATE project_services
   SET health_kind = 'http', health_path = '/'
   WHERE project_id = 2 AND name = 'app'`,
).run();
console.log(
  db
    .prepare(
      "SELECT name, host_port, health_kind, health_path FROM project_services WHERE project_id = 2",
    )
    .all(),
);
db.close();
