'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSkippedTransactions } from '@/app/actions/review-transaction';
import { findPotentialDuplicates } from '@/app/actions/reconcile-transactions';

export default function AlertBadges() {
    const [reviewCount, setReviewCount] = useState(0);
    const [reconcileCount, setReconcileCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const loadCounts = async () => {
            const [reviewRes, reconcileRes] = await Promise.all([
                getSkippedTransactions(),
                findPotentialDuplicates()
            ]);

            setReviewCount(reviewRes.success ? reviewRes.data?.length || 0 : 0);
            setReconcileCount(reconcileRes.data?.length || 0);
            setLoading(false);
        };
        loadCounts();
    }, []);

    if (loading) return null;
    if (reviewCount === 0 && reconcileCount === 0) return null;

    return (
        <div className="flex flex-wrap gap-3 mb-8">
            {reviewCount > 0 && (
                <button
                    onClick={() => router.push('/transactions?filter=review')}
                    className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 rounded-xl transition-all group hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-lg group-hover:scale-110 transition-transform">⚠️</span>
                        <div className="text-left">
                            <p className="text-xs font-medium text-amber-200">Needs Review</p>
                            <p className="text-[10px] text-amber-400/70">Manual tagging required</p>
                        </div>
                    </div>
                    <div className="px-2.5 py-1 bg-amber-500/20 text-amber-300 text-sm font-bold rounded-full min-w-[28px] text-center border border-amber-500/30">
                        {reviewCount}
                    </div>
                </button>
            )}

            {reconcileCount > 0 && (
                <button
                    onClick={() => router.push('/transactions?filter=reconcile')}
                    className="flex items-center gap-3 px-4 py-3 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/20 hover:border-violet-500/40 rounded-xl transition-all group hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-lg group-hover:scale-110 transition-transform">🤝</span>
                        <div className="text-left">
                            <p className="text-xs font-medium text-violet-200">Reconcile</p>
                            <p className="text-[10px] text-violet-400/70">Potential duplicates</p>
                        </div>
                    </div>
                    <div className="px-2.5 py-1 bg-violet-600/20 text-violet-300 text-sm font-bold rounded-full min-w-[28px] text-center border border-violet-500/30">
                        {reconcileCount}
                    </div>
                </button>
            )}
        </div>
    );
}
