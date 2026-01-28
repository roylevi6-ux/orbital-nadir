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
    // Receipt email webhook configuration
    get RESEND_WEBHOOK_SECRET() {
        return process.env.RESEND_WEBHOOK_SECRET;
    },
    get RESEND_API_KEY() {
        // Also check EMAIL_SERVICE_API_KEY as fallback
        return process.env.RESEND_API_KEY || process.env.EMAIL_SERVICE_API_KEY;
    },
    get RECEIPT_EMAIL_DOMAIN() {
        return process.env.RECEIPT_EMAIL_DOMAIN || 'orbitalnadirfinance.org';
    },
};

// For client-side usage (only public env vars)
// Note: These must be set in Vercel dashboard for production
export const clientEnv = {
    get SUPABASE_URL() {
        const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!value) {
            console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
            return '';
        }
        return value;
    },
    get SUPABASE_ANON_KEY() {
        const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!value) {
            console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
            return '';
        }
        return value;
    },
};
