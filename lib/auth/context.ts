import { createClient, createAdminClient } from '@/lib/auth/server';
import { AuthContext, AuthError, ActionResult } from '@/lib/auth/types';

// Re-export types for convenience
export type { ActionResult, AuthContext } from '@/lib/auth/types';
export { AuthError } from '@/lib/auth/types';

/**
 * Gets authenticated user context with household ID.
 * Use this at the start of server actions to avoid repetitive auth boilerplate.
 *
 * @throws {AuthError} if user is not authenticated or has no household
 *
 * @example
 * ```ts
 * export async function myServerAction(): Promise<ActionResult<MyData>> {
 *     try {
 *         const { supabase, user, householdId } = await getAuthContext();
 *         // ... do stuff with supabase, scoped to householdId
 *         return { success: true, data: result };
 *     } catch (error) {
 *         if (error instanceof AuthError) {
 *             return { success: false, error: error.message };
 *         }
 *         return { success: false, error: 'An unexpected error occurred' };
 *     }
 * }
 * ```
 */
export async function getAuthContext(): Promise<AuthContext> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        throw new AuthError('Not authenticated');
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        throw new AuthError('No household found for user');
    }

    return {
        supabase,
        user,
        householdId: profile.household_id,
    };
}

/**
 * Gets authenticated context and creates household/profile if missing.
 * Use this for actions that should auto-provision households (like first upload).
 *
 * @throws {AuthError} if user is not authenticated
 */
export async function getAuthContextWithAutoProvision(): Promise<AuthContext> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        throw new AuthError('Not authenticated');
    }

    // Check for existing profile
    let { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    let householdId = profile?.household_id;

    // Auto-provision if missing
    if (!householdId) {
        const adminDb = createAdminClient();

        // Create Household
        const { data: household, error: hhError } = await adminDb
            .from('households')
            .insert({ name: (user.email || 'User') + "'s Household" })
            .select('id')
            .single();

        if (hhError || !household) {
            throw new AuthError('Failed to create household: ' + hhError?.message);
        }

        // Create User Profile
        const { error: profError } = await adminDb
            .from('user_profiles')
            .insert({
                id: user.id,
                household_id: household.id,
                preferences: {}
            });

        if (profError) {
            throw new AuthError('Failed to create user profile: ' + profError.message);
        }

        householdId = household.id;
    }

    return {
        supabase,
        user,
        householdId,
    };
}

/**
 * Helper to wrap server action logic with consistent error handling
 *
 * @example
 * ```ts
 * export async function myAction(id: string): Promise<ActionResult<Data>> {
 *     return withAuth(async ({ supabase, householdId }) => {
 *         const { data, error } = await supabase
 *             .from('table')
 *             .select('*')
 *             .eq('household_id', householdId)
 *             .eq('id', id)
 *             .single();
 *
 *         if (error) throw new Error(error.message);
 *         return data;
 *     });
 * }
 * ```
 */
export async function withAuth<T>(
    fn: (ctx: AuthContext) => Promise<T>
): Promise<ActionResult<T>> {
    try {
        const ctx = await getAuthContext();
        const data = await fn(ctx);
        return { success: true, data };
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: error.message };
        }
        const message = error instanceof Error ? error.message : 'An unexpected error occurred';
        return { success: false, error: message };
    }
}

/**
 * Same as withAuth but auto-provisions household if missing
 */
export async function withAuthAutoProvision<T>(
    fn: (ctx: AuthContext) => Promise<T>
): Promise<ActionResult<T>> {
    try {
        const ctx = await getAuthContextWithAutoProvision();
        const data = await fn(ctx);
        return { success: true, data };
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: error.message };
        }
        const message = error instanceof Error ? error.message : 'An unexpected error occurred';
        return { success: false, error: message };
    }
}
