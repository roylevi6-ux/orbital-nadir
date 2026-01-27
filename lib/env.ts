/**
 * Environment variable validation and access
 * Validates required env vars at runtime to provide clear error messages
 */

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `Missing required environment variable: ${name}. ` +
            `Please check your .env.local file or deployment configuration.`
        );
    }
    return value;
}

// Lazy getters to avoid validation at import time (for build compatibility)
export const env = {
    get SUPABASE_URL() {
        return getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
    },
    get SUPABASE_ANON_KEY() {
        return getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    },
    get SUPABASE_SERVICE_ROLE_KEY() {
        return getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    },
    get APP_URL() {
        return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    },
    get GEMINI_API_KEY() {
        return process.env.GEMINI_API_KEY;
    },
    get EMAIL_SERVICE_API_KEY() {
        return process.env.EMAIL_SERVICE_API_KEY;
    },
    get EMAIL_FROM() {
        return process.env.EMAIL_FROM;
    },
};

// For client-side usage (only public env vars)
export const clientEnv = {
    get SUPABASE_URL() {
        return getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
    },
    get SUPABASE_ANON_KEY() {
        return getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    },
};
