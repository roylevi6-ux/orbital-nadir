import { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Standardized result type for all server actions
 */
export type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string };

/**
 * Authenticated context returned by getAuthContext
 */
export interface AuthContext {
    supabase: SupabaseClient;
    user: User;
    householdId: string;
}

/**
 * Error thrown when authentication fails
 */
export class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthError';
    }
}
