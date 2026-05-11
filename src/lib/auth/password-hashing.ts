// Server-only argon2id wrappers. `@node-rs/argon2` ships native binaries and has
// no browser entry — importing this file from a client component will break the
// build. Keep client-safe validation helpers in `./registration.ts`.

import { hash, verify } from "@node-rs/argon2";

// `Algorithm` is a `const enum`, which `isolatedModules` forbids importing.
// Hard-coded value: Argon2id = 2. See node_modules/@node-rs/argon2/index.d.ts.
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  try {
    return await verify(encoded, plain);
  } catch {
    return false;
  }
}
