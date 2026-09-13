export function getDbPath(): string {
  return process.env.MANAGER_DB_PATH ?? "./data/manager.sqlite";
}
