import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: req.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return req.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    req.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                    response = NextResponse.next({
                        request: {
                            headers: req.headers,
                        },
                    });
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                },
                remove(name: string, options: CookieOptions) {
                    req.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                    response = NextResponse.next({
                        request: {
                            headers: req.headers,
                        },
                    });
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                },
            },
        }
    );

    // Check if user is authenticated with Supabase (Google OAuth)
    const {
        data: { session },
    } = await supabase.auth.getSession();

    const isLoginPage = req.nextUrl.pathname === '/login';
    const isProtectedRoute = req.nextUrl.pathname.startsWith('/dashboard') ||
        req.nextUrl.pathname.startsWith('/upload') ||
        req.nextUrl.pathname.startsWith('/settings') ||
        req.nextUrl.pathname.startsWith('/skip-queue') ||
        req.nextUrl.pathname.startsWith('/transactions') ||
        req.nextUrl.pathname.startsWith('/accounts') ||
        req.nextUrl.pathname.startsWith('/review') ||
        req.nextUrl.pathname.startsWith('/reconciliation') ||
        req.nextUrl.pathname.startsWith('/tagging');

    // If accessing protected route without OAuth session, redirect to login
    if (isProtectedRoute && !session) {
        return NextResponse.redirect(new URL('/login', req.url));
    }

    // If logged in and trying to access login page, redirect to dashboard
    if (isLoginPage && session) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return response;
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/upload/:path*',
        '/settings/:path*',
        '/skip-queue/:path*',
        '/transactions/:path*',
        '/accounts/:path*',
        '/review/:path*',
        '/reconciliation/:path*',
        '/tagging/:path*',
        '/login',
    ],
};
