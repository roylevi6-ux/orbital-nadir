'use client';

import { useState } from 'react';
import { createClient } from '@/lib/auth/supabase';

export default function LoginPage() {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
                },
            });

            if (error) throw error;
        } catch (err: any) {
            setError(err.message || 'Failed to sign in with Google');
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-bg-app relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/20 blur-3xl opacity-50 animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-600/20 blur-3xl opacity-50 animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            <div className="w-full max-w-md px-8 relative z-10">
                <div className="bg-glass rounded-2xl shadow-xl border border-white/10 p-8 animate-in fade-in zoom-in duration-500">
                    {/* Logo/Title */}
                    <div className="text-center mb-10">
                        <div className="text-6xl mb-4 drop-shadow-[0_0_15px_rgba(139,92,246,0.5)]">💰</div>
                        <h1 className="text-3xl font-bold text-main mb-2 tracking-tight">
                            Orbital Nadir
                        </h1>
                        <p className="text-muted">
                            Household Finance Manager
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                            <p className="text-sm text-rose-400 text-center font-medium">
                                {error}
                            </p>
                        </div>
                    )}


                    {/* Google OAuth */}

                    <div className="space-y-6">
                        <button
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all shadow-lg shadow-black/20 hover:shadow-violet-500/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                            <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            <span className="font-medium text-main group-hover:text-white transition-colors">
                                {loading ? 'Signing in...' : 'Sign in with Google'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <p className="mt-8 text-center text-xs text-muted">
                    🔒 Secure authentication via Supabase Auth
                </p>
            </div>
        </div>
    );
}
