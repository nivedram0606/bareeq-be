import { createClient } from '@supabase/supabase-js';

import { env } from '../config/env.js';

/** Service-role client: Auth Admin API (invites) and Storage uploads. Server-side only. */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const BRANDING_BUCKET = 'branding';

export const publicStorageUrl = (bucket: string, path: string): string =>
  `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
