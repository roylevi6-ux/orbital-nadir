'use client';

import { useState, useEffect } from 'react';
import { getPendingReconciliationCount } from '@/app/actions/p2p-reconciliation';
import ReconciliationResolver from './ReconciliationResolver';

interface ReconciliationCounts {
    matches: number;
    reimbursements: number;
    balancePaid: number;
    total: number;
}

export default function ReconciliationWidget() {
    const [counts, setCounts] = useState<ReconciliationCounts | null>(null);
    const [loading, setLoading] = useState(true);
    const [isResolverOpen, setIsResolverOpen] = useState(false);

    const loadCounts = async () => {
        setLoading(true);
        try {
            const data = await getPendingReconciliationCount();
            setCounts(data);
        } catch (error) {
            console.error('Failed to load reconciliation counts:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCounts();
    }, []);

    const handleComplete = () => {
        loadCounts(); // Refresh counts after resolution
    };

    if (loading) return null;
    if (!counts || counts.total === 0) return null;

    const needsReview = counts.matches + counts.reimbursements;

    return (
        <>
            <div className="card overflow-hidden mb-8 border border-white/10 shadow-lg shadow-black/20">
                <div className="p-4 bg-violet-600/20 border-b border-white/10 flex justify-between items-center backdrop-blur-md">
                    <div className="flex items-center gap-3 text-violet-200">
                        <div className="bg-violet-500/20 p-2 rounded-lg text-lg border border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.2)]">
                            🔄
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-white">Payment Reconciliation</h3>
                            <p className="text-xs text-violet-300/70">
                                {needsReview > 0
                                    ? `${needsReview} payment${needsReview > 1 ? 's' : ''} need review`
                                    : 'All payments reconciled'}
                            </p>
                        </div>
                    </div>

                    {needsReview > 0 && (
                        <button
                            onClick={() => setIsResolverOpen(true)}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-lg hover:shadow-violet-500/25 transition-all"
                        >
                            Review
                        </button>
                    )}
                </div>

                <div className="p-4 bg-slate-900/30">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-2xl font-bold text-amber-400">{counts.matches}</p>
                            <p className="text-xs text-slate-400">Matches</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-emerald-400">{counts.reimbursements}</p>
                            <p className="text-xs text-slate-400">Reimbursements</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-blue-400">{counts.balancePaid}</p>
                            <p className="text-xs text-slate-400">Wallet Paid</p>
                        </div>
                    </div>

                    {(counts.matches > 0 || counts.reimbursements > 0) && (
                        <p className="text-xs text-slate-500 text-center mt-3 italic">
                            Review to link BIT/Paybox payments with credit card entries
                        </p>
                    )}
                </div>
            </div>

            <ReconciliationResolver
                isOpen={isResolverOpen}
                onClose={() => setIsResolverOpen(false)}
                onComplete={handleComplete}
            />
        </>
    );
}
