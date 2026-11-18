import bcrypt from 'bcryptjs';

/** bcrypt cost factor. 12 ≈ 250 ms on a small server: slow for attackers, fine for sign-in. */
const ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

/** A real hash of a random string, compared against when the user does not exist. */
const DUMMY_HASH = bcrypt.hashSync(`dummy-${Math.random()}`, ROUNDS);

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
