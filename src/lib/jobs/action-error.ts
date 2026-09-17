export type JobActionResult = { ok: true; jobId: number } | { ok: false; reason: "busy" | "not_found" | "unavailable" };

export type JobClientResult = { ok: true; jobId: number } | { ok: false; message: string };

export function isNextControlFlow(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("digest" in err)) {
    return false;
  }
  const digest = String((err as { digest: unknown }).digest);
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND");
}

export function messageForActionFailure(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/failed to fetch/i.test(text) || err instanceof TypeError) {
    return "Связь с менеджером оборвалась. Обновите страницу и попробуйте снова.";
  }
  return "Не удалось выполнить действие.";
}

export function messageForJobActionResult(reason: "busy" | "not_found" | "unavailable"): string {
  if (reason === "busy") return "Уже выполняется задача";
  if (reason === "not_found") return "Проект не найден";
  return "Не удалось выполнить действие.";
}

export async function invokeJobAction(run: () => Promise<JobActionResult>): Promise<JobClientResult> {
  try {
    const result = await run();
    if (!result.ok) {
      return { ok: false, message: messageForJobActionResult(result.reason) };
    }
    return result;
  } catch (err) {
    if (isNextControlFlow(err)) {
      throw err;
    }
    return { ok: false, message: messageForActionFailure(err) };
  }
}

export function deferBackgroundWork(start: () => Promise<void>): void {
  setImmediate(() => {
    void start().catch(() => undefined);
  });
}
