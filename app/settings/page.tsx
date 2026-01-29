'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/auth/supabase';
import { sendReminders } from '@/app/actions/send-reminders';
import { getReceiptForwardingEmail } from '@/app/actions/get-receipt-token';
import { toast } from 'sonner';
import { LogOut, User, Mail, Shield, Bell, Receipt, Copy, Check } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [receiptEmail, setReceiptEmail] = useState<string>('');
    const [receiptEmailLoading, setReceiptEmailLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUser(user);
        };
        getUser();

        // Fetch receipt forwarding email
        const fetchReceiptEmail = async () => {
            const result = await getReceiptForwardingEmail();
            if (result.success) {
                setReceiptEmail(result.data.email);
            }
            setReceiptEmailLoading(false);
        };
        fetchReceiptEmail();
    }, []);

    const handleCopyReceiptEmail = () => {
        navigator.clipboard.writeText(receiptEmail);
        setCopied(true);
        toast.success('Email copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

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

                {/* Receipt Forwarding Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                            <Receipt size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Email Receipts</h2>
                    </div>

                    <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)]">
                        <h3 className="text-sm font-bold text-gray-200 mb-2">Forward Receipts</h3>
                        <p className="text-xs text-muted mb-4">
                            Forward purchase receipts to this email address. They will be automatically
                            parsed and matched to your transactions for better categorization.
                        </p>

                        {receiptEmailLoading ? (
                            <div className="h-10 bg-slate-800/50 rounded animate-pulse" />
                        ) : (
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-emerald-400 font-mono overflow-x-auto">
                                    {receiptEmail || 'Not available'}
                                </code>
                                <button
                                    onClick={handleCopyReceiptEmail}
                                    disabled={!receiptEmail}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                            <h4 className="text-xs font-bold text-slate-400 mb-2">Gmail Filter Setup</h4>
                            <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                                <li>Go to Gmail Settings &rarr; Filters and Blocked Addresses</li>
                                <li>Create a filter with: Has the words: &quot;receipt&quot; OR &quot;order confirmation&quot;</li>
                                <li>Action: Forward to the address above</li>
                            </ol>
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
