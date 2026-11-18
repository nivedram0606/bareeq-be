import type { User } from '@supabase/supabase-js';

import { AppError } from './errors.js';
import { logger } from './logger.js';
import { supabaseAdmin } from './supabase.js';

const emailTaken = () =>
  AppError.conflict('A user with this e-mail already exists', {
    email: 'validation.email_taken',
  });

/** Creates a confirmed Supabase Auth user with a password (no e-mail is sent). */
export async function createAuthUserWithPassword(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<User> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error) {
    if (error.status === 422 || error.code === 'email_exists') throw emailTaken();
    if (error.code === 'weak_password') {
      throw AppError.validation('Password is too weak', {
        password: 'validation.password_short',
      });
    }
    throw new Error(`Creating auth user failed: ${error.message}`, { cause: error });
  }
  return data.user;
}

/** Sends a Supabase invite e-mail; the invitee chooses a password at `redirectTo`. */
export async function inviteAuthUser(input: {
  email: string;
  fullName: string;
  redirectTo: string;
}): Promise<User> {
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: input.redirectTo,
    data: { full_name: input.fullName },
  });
  if (error) {
    if (error.status === 422 || error.code === 'email_exists') throw emailTaken();
    throw new Error(`Invite failed: ${error.message}`, { cause: error });
  }
  return data.user;
}

/** Best-effort removal, used to undo an auth user when its profile could not be saved. */
export async function deleteAuthUserQuietly(id: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) logger.error({ err: error, id }, 'Failed to roll back auth user');
}

export async function findAuthUserByEmail(email: string): Promise<User | undefined> {
  const target = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return undefined;
  }
}
