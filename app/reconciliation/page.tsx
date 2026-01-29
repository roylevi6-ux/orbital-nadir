'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import ReconciliationWidget from '@/components/dashboard/ReconciliationWidget';
import ReconciliationResolver from '@/components/dashboard/ReconciliationResolver';
import { getPendingReconciliationCount } from '@/app/actions/p2p-reconciliation';

export default function ReconciliationPage() {
    const [isResolverOpen, setIsResolverOpen] = useState(false);
    const [counts, setCounts] = useState<{
        matches: number;
        reimbursements: number;
        balancePaid: number;
        total: number;
    } | null>(null);

    const loadCounts = async () => {
        const data = await getPendingReconciliationCount();
        setCounts(data);
    };

    useEffect(() => {
        loadCounts();
    }, []);

    const handleComplete = () => {
        loadCounts();
    };

    const needsReview = counts ? counts.matches + counts.reimbursements : 0;

    return (
        <AppShell>
            <main className="max-w-[1600px] mx-auto px-6 py-8 animate-in">
                {/* Header */}
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-main tracking-tight flex items-center gap-3">
                        <span>🔄</span> Payment Reconciliation
                    </h2>
                    <p className="text-muted mt-1">Review and link BIT/Paybox payments with credit card entries</p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="holo-card p-6 bg-amber-500/5 border-amber-500/20">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🔗</span>
                            <span className="text-sm font-medium text-amber-400">Pending Matches</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{counts?.matches ?? '—'}</p>
                        <p className="text-xs text-muted mt-1">CC entries matched to App payments</p>
                    </div>

                    <div className="holo-card p-6 bg-emerald-500/5 border-emerald-500/20">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">💰</span>
                            <span className="text-sm font-medium text-emerald-400">Reimbursements</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{counts?.reimbursements ?? '—'}</p>
                        <p className="text-xs text-muted mt-1">Incoming payments to classify</p>
                    </div>

                    <div className="holo-card p-6 bg-blue-500/5 border-blue-500/20">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">💳</span>
                            <span className="text-sm font-medium text-blue-400">Wallet Paid</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{counts?.balancePaid ?? '—'}</p>
                        <p className="text-xs text-muted mt-1">Paid from BIT/Paybox balance</p>
                    </div>
                </div>

                {/* Action Section */}
                {needsReview > 0 ? (
                    <div className="holo-card p-8 text-center bg-gradient-to-b from-violet-500/10 to-transparent border-violet-500/30">
                        <div className="text-6xl mb-4">🔄</div>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {needsReview} Payment{needsReview > 1 ? 's' : ''} Need{needsReview === 1 ? 's' : ''} Review
                        </h3>
                        <p className="text-muted mb-6 max-w-md mx-auto">
                            Review matches between your credit card entries and BIT/Paybox payments to keep your financial data accurate.
                        </p>
                        <button
                            onClick={() => setIsResolverOpen(true)}
                            className="px-8 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/25"
                        >
                            Start Review
                        </button>
                    </div>
                ) : (
                    <div className="holo-card p-12 text-center bg-gradient-to-b from-emerald-500/5 to-transparent border-emerald-500/20">
                        <div className="text-6xl mb-4">✨</div>
                        <h3 className="text-xl font-bold text-emerald-400 mb-2">All Caught Up!</h3>
                        <p className="text-muted">No payments need reconciliation right now.</p>
                    </div>
                )}

                {/* How It Works */}
                <div className="mt-12">
                    <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="holo-card p-4 bg-white/5">
                            <div className="text-2xl mb-2">1️⃣</div>
                            <h4 className="font-bold text-white mb-1">Match Payments</h4>
                            <p className="text-xs text-muted">
                                When you pay with BIT via credit card, we link the generic &ldquo;BIT&rdquo; CC entry to the detailed App screenshot.
                            </p>
                        </div>
                        <div className="holo-card p-4 bg-white/5">
                            <div className="text-2xl mb-2">2️⃣</div>
                            <h4 className="font-bold text-white mb-1">Wallet Payments</h4>
                            <p className="text-xs text-muted">
                                Payments made from your BIT/Paybox balance (not CC) are marked separately.
                            </p>
                        </div>
                        <div className="holo-card p-4 bg-white/5">
                            <div className="text-2xl mb-2">3️⃣</div>
                            <h4 className="font-bold text-white mb-1">Reimbursements</h4>
                            <p className="text-xs text-muted">
                                Incoming payments are classified as reimbursements, reducing expense totals in the category you choose.
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <ReconciliationResolver
                isOpen={isResolverOpen}
                onClose={() => setIsResolverOpen(false)}
                onComplete={handleComplete}
            />
        </AppShell>
    );
}
