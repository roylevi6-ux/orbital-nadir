'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/auth/supabase';
import { findMonthlyDuplicates, mergeTransactions, DuplicateCandidate } from '@/app/actions/reconcile-transactions';
import NavReconciliationBadge from '@/components/dashboard/NavReconciliationBadge';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';

export default function ReconciliationPage() {
    const [loading, setLoading] = useState(false);
    const [matches, setMatches] = useState<DuplicateCandidate[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [processingId, setProcessingId] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    const fetchMatches = async () => {
        setLoading(true);
        const result = await findMonthlyDuplicates(selectedYear, selectedMonth);
        setLoading(false);

        if (result.success && result.matches) {
            setMatches(result.matches);
        } else {
            toast.error('Error finding duplicates', { description: result.error });
        }
    };

    useEffect(() => {
        fetchMatches();
    }, [selectedMonth, selectedYear]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    const handleMerge = async (match: DuplicateCandidate) => {
        setProcessingId(match.appTransaction.id);
        const result = await mergeTransactions(match.appTransaction.id, match.ccTransaction.id);
        setProcessingId(null);

        if (result.success) {
            toast.success('Transactions merged successfully');
            // Remove match from list
            setMatches(matches.filter(m => m.appTransaction.id !== match.appTransaction.id));
        } else {
            toast.error('Error merging transactions', { description: result.error });
        }
    };

    const handleSkip = (match: DuplicateCandidate) => {
        // Just remove from current view
        setMatches(matches.filter(m => m.appTransaction.id !== match.appTransaction.id));
    };

    const months = [
        { value: 1, label: 'January' },
        { value: 2, label: 'February' },
        { value: 3, label: 'March' },
        { value: 4, label: 'April' },
        { value: 5, label: 'May' },
        { value: 6, label: 'June' },
        { value: 7, label: 'July' },
        { value: 8, label: 'August' },
        { value: 9, label: 'September' },
        { value: 10, label: 'October' },
        { value: 11, label: 'November' },
        { value: 12, label: 'December' }
    ];

    return (
        <AppShell>
            <main className="max-w-[1600px] mx-auto px-6 py-8 animate-in">
                {/* Header */}
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-main tracking-tight flex items-center gap-3">
                        <span>🔄</span> Reconciliation
                    </h2>
                    <p className="text-muted mt-1">Review and merge duplicate BIT/Paybox transactions with credit card charges</p>
                </div>

                {/* Month Selector */}
                <div className="holo-card p-6 mb-6 flex items-center gap-4">
                    <label className="text-sm font-medium text-[var(--text-muted)]">Select Month:</label>
                    <div className="flex gap-2">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            {months.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            {[2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={fetchMatches}
                        disabled={loading}
                        className="ml-auto px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-violet-500/25 disabled:opacity-50"
                    >
                        {loading ? 'Searching...' : 'Find Matches'}
                    </button>
                </div>

                {/* Results */}
                {loading ? (
                    <div className="holo-card p-12 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
                        <p className="text-[var(--text-muted)]">Searching for duplicates...</p>
                    </div>
                ) : matches.length === 0 ? (
                    <div className="holo-card p-12 text-center bg-gradient-to-b from-emerald-500/5 to-transparent border-emerald-500/20">
                        <div className="text-6xl mb-4 grayscale opacity-50">✅</div>
                        <h3 className="text-xl font-bold text-emerald-400 mb-2">No Duplicates Found</h3>
                        <p className="text-[var(--text-muted)]">All transactions for {months.find(m => m.value === selectedMonth)?.label} are unique.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="text-sm text-[var(--text-muted)] mb-4 flex items-center justify-between">
                            <span>Found <strong className="text-[var(--text-bright)]">{matches.length}</strong> potential duplicate{matches.length !== 1 ? 's' : ''}</span>
                        </div>

                        {matches.map((match, index) => (
                            <div key={match.appTransaction.id} className="holo-card overflow-hidden group hover:border-violet-500/50 transition-colors">
                                <div className="bg-[var(--bg-card)] px-6 py-3 border-b border-[var(--border-glass)] flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium text-[var(--text-muted)]">Potential Duplicate #{index + 1}</span>
                                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${match.confidence >= 95 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                            match.confidence >= 90 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' :
                                                'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                            }`}>
                                            {match.confidence}% Match
                                        </span>
                                    </div>
                                    <span className="text-xs text-[var(--text-muted)]">{match.reason}</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
                                    {/* BIT/Paybox Transaction */}
                                    <div className="p-6 bg-violet-500/5 relative">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 to-transparent opacity-50" />
                                        <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span>📱</span> Payment App
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-[var(--text-muted)]">Date</span>
                                                <span className="text-sm font-medium text-[var(--text-bright)]">{new Date(match.appTransaction.date).toLocaleDateString('en-GB')}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-[var(--bg-card)] p-2 rounded-lg">
                                                <span className="text-sm text-[var(--text-muted)]">Amount</span>
                                                <span className="text-lg font-bold text-white font-mono">{match.appTransaction.currency} {match.appTransaction.amount}</span>
                                            </div>
                                            <div>
                                                <div className="text-xs text-[var(--text-muted)] mb-1">Merchant / Description</div>
                                                <div className="text-sm font-medium text-white truncate">{match.appTransaction.merchant_raw}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CC Transaction */}
                                    <div className="p-6 bg-cyan-500/5 relative">
                                        <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-transparent opacity-50 md:hidden" />
                                        <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span>💳</span> Bank Statement
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-[var(--text-muted)]">Date</span>
                                                <span className="text-sm font-medium text-[var(--text-bright)]">{new Date(match.ccTransaction.date).toLocaleDateString('en-GB')}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-[var(--bg-card)] p-2 rounded-lg">
                                                <span className="text-sm text-[var(--text-muted)]">Amount</span>
                                                <span className="text-lg font-bold text-white font-mono">{match.ccTransaction.currency} {match.ccTransaction.amount}</span>
                                            </div>
                                            <div>
                                                <div className="text-xs text-[var(--text-muted)] mb-1">Merchant</div>
                                                <div className="text-sm font-medium text-white truncate">{match.ccTransaction.merchant_raw}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="bg-[var(--bg-card)] px-6 py-4 flex justify-end gap-3 border-t border-[var(--border-glass)]">
                                    <button
                                        onClick={() => handleSkip(match)}
                                        className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                                    >
                                        Skip
                                    </button>
                                    <button
                                        onClick={() => handleMerge(match)}
                                        disabled={processingId === match.appTransaction.id}
                                        className="px-6 py-2 text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {processingId === match.appTransaction.id ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Merging...
                                            </>
                                        ) : (
                                            'Merge & Reconcile'
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </AppShell>
    );
}
