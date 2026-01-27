'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/auth/supabase';
import { sendReminders } from '@/app/actions/send-reminders';
import { toast } from 'sonner';
import { LogOut, User, Mail, Shield, Bell } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUser(user);
        };
        getUser();
    }, []);

    const handleTestNotification = async () => {
        setLoading(true);
        try {
            const result = await sendReminders();
            if (result.success) {
                if (result.message) {
                    toast.success(result.message);
                } else {
                    toast.success(`Email sent to ${result.sentTo}`, {
                        description: `${result.items} items require attention`
                    });
                }
            } else {
                toast.error('Failed to send notification', {
                    description: result.error
                });
            }
        } catch (e) {
            toast.error('Failed to send notification');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <AppShell>
            <main className="max-w-2xl mx-auto px-6 py-8 animate-in">
                {/* Page Title */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-[var(--text-bright)]">Settings</h1>
                    <p className="text-muted text-sm">Manage preferences and account details.</p>
                </div>

                {/* Notifications Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                            <Bell size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Notifications & Alerts</h2>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)]">
                        <div>
                            <h3 className="text-sm font-bold text-gray-200">Email Reminders</h3>
                            <p className="text-xs text-muted mt-1">
                                Receive monthly digests on the 5th and 15th if action is needed.
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleTestNotification}
                                disabled={loading}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-lg shadow-violet-500/20 transition-all uppercase tracking-wide"
                            >
                                {loading ? 'Sending...' : 'Test Now'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Account Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                            <User size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Account Details</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] flex items-center justify-between group hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-slate-800 rounded-full text-[var(--text-muted)]">
                                    <Mail size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-0.5">Email Address</p>
                                    <p className="text-sm font-medium text-[var(--text-bright)]">{user?.email || 'Loading...'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] flex items-center justify-between group hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-slate-800 rounded-full text-[var(--text-muted)]">
                                    <Shield size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-0.5">User ID</p>
                                    <p className="text-xs font-mono text-[var(--text-muted)]">{user?.id || '...'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleSignOut}
                                className="w-full py-3 flex items-center justify-center gap-2 text-rose-400 hover:text-white hover:bg-rose-600 border border-rose-500/20 hover:border-rose-600 rounded-xl transition-all font-medium text-sm shadow-lg shadow-transparent hover:shadow-rose-600/20"
                            >
                                <LogOut size={16} />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </AppShell>
    );
}
