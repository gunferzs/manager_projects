export const INVALID_DATA_MESSAGE = "Неверные данные";

export function formatLockMessage(until: Date, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return `Попробуйте через ${minutes} минут`;
}
