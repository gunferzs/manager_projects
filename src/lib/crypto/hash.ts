import argon2 from "argon2";

export async function hashSecret(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifySecret(plain: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
