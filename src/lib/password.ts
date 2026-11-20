import bcrypt from 'bcryptjs';

/**
 * bcrypt cost factor. 10 is OWASP's minimum for bcrypt and keeps sign-in under a second on
 * small shared CPUs (Render's free plan took ~2.7 s at 12). Each +1 doubles the cost.
 */
export const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** A real hash of a random string, compared against when the user does not exist. */
const DUMMY_HASH = bcrypt.hashSync(`dummy-${Math.random()}`, BCRYPT_ROUNDS);

/**
 * Checks `password` against a stored bcrypt hash. With no hash (unknown user or an account
 * that has no password yet) it still runs one comparison, so response time doesn't reveal
 * which usernames exist.
 */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/** True when a stored hash uses a different cost than `BCRYPT_ROUNDS` and should be re-saved. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) !== BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}
