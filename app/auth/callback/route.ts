import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { env } from '@/lib/env';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/dashboard';

    if (code) {
        const cookieStore = new Map();

        // We need to parse the cookies from the request headers manually or use NextRequest
        // However, createServerClient needs specific implementations.
        // Let's rely on standard response manipulation.

        const supabase = createServerClient(
            env.SUPABASE_URL,
            env.SUPABASE_ANON_KEY,
            {
                cookies: {
                    get(name: string) {
                        const cookieHeader = request.headers.get('Cookie') || '';
                        const match = cookieHeader.match(new RegExp('(^| )' + name + '=([^;]+)'));
                        return match ? match[2] : undefined;
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        cookieStore.set(name, { value, options });
                    },
                    remove(name: string, options: CookieOptions) {
                        cookieStore.set(name, { value: '', options: { ...options, maxAge: 0 } });
                    },
                },
            }
        );

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            const response = NextResponse.redirect(`${origin}${next}`);

            // Apply the cookies that were set during exchangeCodeForSession to the response
            cookieStore.forEach((cookieVal, cookieName) => {
                response.cookies.set({
                    name: cookieName,
                    value: cookieVal.value,
                    ...cookieVal.options
                });
            });

            return response;
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
