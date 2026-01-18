import { createClient } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ReviewManager from '@/components/review/ReviewManager';
import DuplicateReview from '@/components/review/DuplicateReview';
import UploadDuplicateReview from '@/components/review/UploadDuplicateReview';
import SalaryWidget from '@/components/dashboard/SalaryWidget';
import { findPotentialDuplicates } from '@/app/actions/reconcile-transactions';

interface ReviewPageProps {
    searchParams: Promise<{ mode?: string }>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
    const params = await searchParams;
    const mode = params?.mode;

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

    // If mode=duplicates, show the upload duplicate review (client component)
    if (mode === 'duplicates') {
        return (
            <AppShell>
                <main className="max-w-5xl mx-auto px-6 py-8 animate-in text-white mb-20">
                    <div className="flex items-center gap-4 mb-8">
                        <Link href="/upload" className="p-2 -ml-2 text-muted hover:text-white hover:bg-[var(--bg-card)] rounded-lg transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                                Review Duplicates
                            </h1>
                            <p className="text-muted text-sm mt-1">
                                Review potential duplicates before saving your uploaded transactions.
                            </p>
                        </div>
                    </div>
                    <UploadDuplicateReview />
                </main>
            </AppShell>
        );
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

    const { data: duplicateCandidates } = await findPotentialDuplicates();

    const hasItems = reviewList && reviewList.length > 0;
    const hasDuplicates = duplicateCandidates && duplicateCandidates.length > 0;
    const isAllClear = !hasItems && !hasDuplicates;

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
                            Verify low-confidence items and confirm duplicates to keep your data clean.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end mb-6">
                    <SalaryWidget />
                </div>

                {isAllClear && (
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

                    {hasDuplicates && (
                        <section className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-8 w-1 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                                <h2 className="text-xl font-bold text-cyan-100">
                                    Potential Duplicates
                                    <span className="ml-3 text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/20">
                                        {duplicateCandidates.length} pairs
                                    </span>
                                </h2>
                            </div>
                            <div className="grid gap-4">
                                {duplicateCandidates.map((candidate, i) => (
                                    <DuplicateReview key={i} candidate={candidate} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>

            </main>
        </AppShell>
    );
}
