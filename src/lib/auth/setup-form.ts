export type SetupFieldsResult =
  | { ok: true; key: string }
  | { ok: false; message: string };

export function validateSetupFields(a: string, b: string): SetupFieldsResult {
  if (a.length < 16 || b.length < 16) {
    return { ok: false, message: "Ключ не короче 16 символов" };
  }
  if (a !== b) {
    return { ok: false, message: "Ключи не совпадают" };
  }
  return { ok: true, key: a };
}
