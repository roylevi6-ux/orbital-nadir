import { createClient } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ReviewManager from '@/components/review/ReviewManager';
import SalaryWidget from '@/components/dashboard/SalaryWidget';
import ReconciliationWidget from '@/components/dashboard/ReconciliationWidget';

interface ReviewPageProps {
    searchParams: Promise<{ mode?: string }>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
    const params = await searchParams;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

    if (!profile?.household_id) {
        return <div>Error: No household found.</div>;
    }

    // Normal review mode - fetch existing data
    const { data: reviewList } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', profile.household_id)
        .in('status', ['skipped', 'flagged', 'pending'])
        .order('date', { ascending: false });

    const flaggedTransactions = reviewList?.filter(t => t.status === 'flagged' || t.status === 'pending') || [];
    const skippedTransactions = reviewList?.filter(t => t.status === 'skipped') || [];

    const hasItems = reviewList && reviewList.length > 0;

    return (
        <AppShell>
            <main className="max-w-5xl mx-auto px-6 py-8 animate-in text-white mb-20">

                <div className="flex items-center gap-4 mb-8">
                    <Link href="/dashboard" className="p-2 -ml-2 text-muted hover:text-white hover:bg-[var(--bg-card)] rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            Review Session
                        </h1>
                        <p className="text-muted text-sm mt-1">
                            Verify low-confidence items and reconcile P2P payments to keep your data clean.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end mb-6">
                    <SalaryWidget />
                </div>

                {/* Payment Reconciliation Widget */}
                <ReconciliationWidget />

                {!hasItems && (
                    <div className="holo-card p-12 text-center flex flex-col items-center justify-center border-emerald-500/20 bg-emerald-500/5">
                        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mb-4 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                            ✨
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">All Caught Up!</h2>
                        <p className="text-muted max-w-md mx-auto mb-8">
                            No items need your attention right now. Your dashboard is up to date.
                        </p>
                        <Link
                            href="/dashboard"
                            className="px-6 py-3 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-200 transition-colors shadow-lg shadow-white/10"
                        >
                            Go to Dashboard
                        </Link>
                    </div>
                )}

                <div className="space-y-12">
                    {hasItems && (
                        <ReviewManager
                            flaggedTransactions={flaggedTransactions}
                            skippedTransactions={skippedTransactions}
                        />
                    )}
                </div>

            </main>
        </AppShell>
    );
}
