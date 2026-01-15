'use client';

import { useState, useEffect } from 'react';
import { findPotentialDuplicates, mergeTransactions, DuplicateCandidate } from '@/app/actions/reconcile-transactions';
import { useRouter } from 'next/navigation';

export default function ReconciliationWidget() {
    const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        loadCandidates();
    }, []);

    const loadCandidates = async () => {
        const { data, error } = await findPotentialDuplicates();
        if (data) setCandidates(data);
        setLoading(false);
    };

    const handleMerge = async (candidate: DuplicateCandidate) => {
        setProcessingId(candidate.appTransaction.id);
        const res = await mergeTransactions(candidate.appTransaction.id, candidate.ccTransaction.id);

        if (res.success) {
            setCandidates(prev => prev.filter(c => c.appTransaction.id !== candidate.appTransaction.id));
            router.refresh(); // Update lists elsewhere
        } else {
            alert('Merge failed: ' + res.error);
        }
        setProcessingId(null);
    };

    if (loading) return null;
    if (candidates.length === 0) return null;

    return (
        <div className="card overflow-hidden mb-8 border border-white/10 shadow-lg shadow-black/20">
            <div className="p-4 bg-violet-600/20 border-b border-white/10 flex justify-between items-center backdrop-blur-md">
                <div className="flex items-center gap-3 text-violet-200">
                    <div className="bg-violet-500/20 p-2 rounded-lg text-lg border border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.2)]">🤝</div>
                    <div>
                        <h3 className="font-bold text-sm text-white">Smart Reconciliation</h3>
                        <p className="text-xs text-violet-300/70">{candidates.length} potential duplicates found</p>
                    </div>
                </div>
            </div>

            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto bg-slate-900/30">
                {candidates.map((candidate, idx) => (
                    <div key={idx} className="p-4 hover:bg-white/5 transition-colors">
                        <div className="flex flex-col sm:flex-row items-center gap-4">

                            {/* App Side */}
                            <div className="flex-1 p-3 bg-slate-800/50 border border-white/5 rounded-lg shadow-sm w-full backdrop-blur-sm">
                                <div className="text-xs text-slate-400 font-medium uppercase mb-1">App Screenshot</div>
                                <div className="font-bold text-main">{candidate.appTransaction.merchant_raw}</div>
                                <div className="flex justify-between mt-1 text-sm text-muted">
                                    <span>{new Date(candidate.appTransaction.date).toLocaleDateString('en-GB')}</span>
                                    <span className="font-mono text-white">{candidate.appTransaction.amount} ₪</span>
                                </div>
                            </div>

                            {/* Link Icon */}
                            <div className="text-violet-400 text-xl animate-pulse">
                                ➔
                            </div>

                            {/* CC Side */}
                            <div className="flex-1 p-3 bg-slate-800/50 border border-white/5 rounded-lg shadow-sm w-full backdrop-blur-sm">
                                <div className="text-xs text-slate-400 font-medium uppercase mb-1">Credit Card</div>
                                <div className="font-bold text-main">{candidate.ccTransaction.merchant_raw}</div>
                                <div className="flex justify-between mt-1 text-sm text-muted">
                                    <span>{new Date(candidate.ccTransaction.date).toLocaleDateString('en-GB')}</span>
                                    <span className="font-mono text-white">{candidate.ccTransaction.amount} ₪</span>
                                </div>
                            </div>

                            {/* Action */}
                            <button
                                onClick={() => handleMerge(candidate)}
                                disabled={processingId === candidate.appTransaction.id}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-lg hover:shadow-violet-500/25 whitespace-nowrap disabled:opacity-50 min-w-[100px] transition-all"
                            >
                                {processingId === candidate.appTransaction.id ? 'Merging...' : 'Merge & Fix'}
                            </button>
                        </div>
                        <div className="mt-2 text-center">
                            <p className="text-xs text-slate-500 italic">
                                "{candidate.appTransaction.merchant_raw}" details will check into the credit card entry.
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
