import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );
}

/**
 * DANGER: Creates a Supabase client with service role key that BYPASSES Row Level Security.
 *
 * Only use this for:
 * - Background jobs/cron tasks
 * - Admin operations that need cross-household access
 * - Database migrations/seeding
 *
 * NEVER use for user-facing requests where RLS should apply.
 */
export function createAdminClient() {
    return createServerClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            cookies: {
                getAll() { return []; },
                setAll() { }
            }
        }
    );
}
