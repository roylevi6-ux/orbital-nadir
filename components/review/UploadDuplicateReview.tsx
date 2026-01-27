'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveTransactions } from '@/app/actions/save-transactions';
import { aiCategorizeTransactions } from '@/app/actions/ai-categorize';
import { DuplicateMatch } from '@/app/actions/check-duplicates';
import { Check, X, AlertTriangle, Save } from 'lucide-react';
import { toast } from 'sonner';

interface PendingTransaction {
    date: string;
    merchant_raw: string;
    amount: number;
    type: string;
    sourceFile?: string;
    sourceType?: string;
    [key: string]: any;
}

export default function UploadDuplicateReview() {
    const router = useRouter();
    const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
    const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
    const [sourceType, setSourceType] = useState<string>('upload');
    const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Track resolution choice for each duplicate: 'skip_new' | 'keep_both' | 'replace_existing'
    const [resolutions, setResolutions] = useState<Map<number, 'skip_new' | 'keep_both' | 'replace_existing'>>(new Map());

    // Load data from sessionStorage on mount
    useEffect(() => {
        const txData = sessionStorage.getItem('pendingTransactions');
        const dupData = sessionStorage.getItem('duplicateMatches');
        const srcType = sessionStorage.getItem('sourceType');

        if (txData) {
            setTransactions(JSON.parse(txData));
        }
        if (dupData) {
            const parsedDups = JSON.parse(dupData);
            setDuplicates(parsedDups);
            // Default all to 'skip_new' and add to excludedIndices
            const newExcluded = new Set<number>();
            const newResolutions = new Map<number, 'skip_new' | 'keep_both' | 'replace_existing'>();
            parsedDups.forEach((_: DuplicateMatch, i: number) => {
                newResolutions.set(i, 'skip_new');
            });
            setResolutions(newResolutions);
        }
        if (srcType) {
            setSourceType(srcType);
        }
        setIsLoaded(true);
    }, []);

    // Update resolution for a duplicate
    const setResolution = (dupIndex: number, txIndex: number, choice: 'skip_new' | 'keep_both' | 'replace_existing') => {
        const newResolutions = new Map(resolutions);
        newResolutions.set(dupIndex, choice);
        setResolutions(newResolutions);

        // Update excludedIndices based on choice
        const newExcluded = new Set(excludedIndices);
        if (choice === 'skip_new') {
            newExcluded.add(txIndex);
        } else {
            newExcluded.delete(txIndex);
        }
        setExcludedIndices(newExcluded);
    };

    // Mark a transaction as excluded (don't save it) - legacy toggle
    const toggleExclude = (index: number) => {
        const newExcluded = new Set(excludedIndices);
        if (newExcluded.has(index)) {
            newExcluded.delete(index);
        } else {
            newExcluded.add(index);
        }
        setExcludedIndices(newExcluded);
    };

    // Find index of transaction in main list that matches a duplicate
    const findTransactionIndex = (dup: DuplicateMatch): number => {
        return transactions.findIndex(t =>
            t.date === dup.newTransaction.date &&
            t.amount === dup.newTransaction.amount &&
            t.merchant_raw === dup.newTransaction.merchant_raw
        );
    };

    // Save transactions (excluding marked duplicates)
    const handleSave = async () => {
        setLoading(true);

        try {
            // First, delete existing transactions for 'replace_existing' choices
            const { deleteTransaction } = await import('@/app/actions/delete-transaction');
            const toDelete: string[] = [];

            resolutions.forEach((choice, dupIndex) => {
                if (choice === 'replace_existing' && duplicates[dupIndex]) {
                    toDelete.push(duplicates[dupIndex].existingTransaction.id);
                }
            });

            if (toDelete.length > 0) {
                toast.info(`Removing ${toDelete.length} existing duplicates...`);
                for (const id of toDelete) {
                    await deleteTransaction(id);
                }
            }

            // Filter out excluded transactions (skip_new)
            const toSave = transactions.filter((_, i) => !excludedIndices.has(i));

            if (toSave.length === 0) {
                toast.error('No transactions to save');
                setLoading(false);
                return;
            }

            const result = await saveTransactions(
                toSave.map(t => ({
                    ...t,
                    type: t.type === 'income' ? 'income' : 'expense',
                    currency: t.currency || 'ILS',
                    status: t.status || 'pending'
                } as const)),
                sourceType
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to save transactions');
            }

            const count = result.data.count;
            const replaced = toDelete.length;
            const skipped = excludedIndices.size - replaced;
            toast.success(`Saved ${count} transactions${replaced > 0 ? `, replaced ${replaced}` : ''}${skipped > 0 ? `, skipped ${skipped}` : ''}`);
            toast.info('🤖 AI is categorizing in background...', { duration: 5000 });

            // Fire-and-forget AI categorization
            aiCategorizeTransactions().catch(err => {
                console.error('Background AI categorization error:', err);
            });

            // Clear sessionStorage
            sessionStorage.removeItem('pendingTransactions');
            sessionStorage.removeItem('duplicateMatches');
            sessionStorage.removeItem('sourceType');

            // Redirect to transactions
            setTimeout(() => {
                router.push('/transactions');
                router.refresh();
            }, 1000);

        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error.message || 'Failed to save');
        } finally {
            setLoading(false);
        }
    };

    // Cancel and go back
    const handleCancel = () => {
        sessionStorage.removeItem('pendingTransactions');
        sessionStorage.removeItem('duplicateMatches');
        sessionStorage.removeItem('sourceType');
        router.push('/upload');
    };

    if (!isLoaded) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-violet-500 mx-auto"></div>
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className="holo-card p-8 text-center">
                <p className="text-muted">No pending transactions to review.</p>
                <button
                    onClick={() => router.push('/upload')}
                    className="mt-4 px-4 py-2 bg-violet-500/20 text-violet-400 rounded-lg hover:bg-violet-500/30"
                >
                    Go to Upload
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        Potential Duplicates Found
                    </h2>
                    <p className="text-muted text-sm mt-1">
                        Review matches below. Excluded items won't be saved.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 text-slate-400 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save {transactions.length - excludedIndices.size} Transactions
                    </button>
                </div>
            </div>

            {/* Duplicate Cards */}
            <div className="space-y-4">
                {duplicates.map((dup, i) => {
                    const txIndex = findTransactionIndex(dup);
                    const isExcluded = excludedIndices.has(txIndex);

                    return (
                        <div
                            key={i}
                            className={`holo-card p-4 transition-all ${isExcluded ? 'opacity-50 border-red-500/30' : 'border-amber-500/30'}`}
                        >
                            <div className="flex items-center justify-between gap-4">
                                {/* New Transaction (from upload) */}
                                <div className="flex-1">
                                    <div className="text-[10px] uppercase text-amber-400 mb-1">New Upload</div>
                                    <div className="font-medium text-white">{dup.newTransaction.merchant_raw}</div>
                                    <div className="text-sm font-mono text-rose-400">
                                        ₪{Math.abs(dup.newTransaction.amount).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted">{new Date(dup.newTransaction.date).toLocaleDateString('en-GB')}</div>
                                </div>

                                {/* Match indicator */}
                                <div className="flex flex-col items-center px-4">
                                    <div className="text-xs text-amber-400 font-mono">{dup.confidence}%</div>
                                    <div className="text-[10px] text-muted">{dup.reason}</div>
                                </div>

                                {/* Existing Transaction */}
                                <div className="flex-1 text-right">
                                    <div className="text-[10px] uppercase text-emerald-400 mb-1">Already Exists</div>
                                    <div className="font-medium text-white">{dup.existingTransaction.merchant_normalized || dup.existingTransaction.merchant_raw}</div>
                                    <div className="text-sm font-mono text-rose-400">
                                        ₪{Math.abs(dup.existingTransaction.amount).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted">{new Date(dup.existingTransaction.date).toLocaleDateString('en-GB')}</div>
                                    {dup.existingTransaction.category && (
                                        <div className="text-xs text-violet-400 mt-1">{dup.existingTransaction.category}</div>
                                    )}
                                </div>

                                {/* Action Buttons - Radio Style */}
                                <div className="flex flex-col gap-1 pl-4 border-l border-white/10 min-w-[140px]">
                                    <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all ${resolutions.get(i) === 'skip_new'
                                            ? 'bg-slate-500/20 border border-slate-500/50'
                                            : 'hover:bg-white/5'
                                        }`}>
                                        <input
                                            type="radio"
                                            name={`resolution-${i}`}
                                            checked={resolutions.get(i) === 'skip_new'}
                                            onChange={() => setResolution(i, txIndex, 'skip_new')}
                                            className="accent-slate-500"
                                        />
                                        <span className="text-xs text-slate-300">Keep Existing</span>
                                    </label>
                                    <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all ${resolutions.get(i) === 'replace_existing'
                                            ? 'bg-amber-500/20 border border-amber-500/50'
                                            : 'hover:bg-white/5'
                                        }`}>
                                        <input
                                            type="radio"
                                            name={`resolution-${i}`}
                                            checked={resolutions.get(i) === 'replace_existing'}
                                            onChange={() => setResolution(i, txIndex, 'replace_existing')}
                                            className="accent-amber-500"
                                        />
                                        <span className="text-xs text-amber-300">Keep New</span>
                                    </label>
                                    <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all ${resolutions.get(i) === 'keep_both'
                                            ? 'bg-emerald-500/20 border border-emerald-500/50'
                                            : 'hover:bg-white/5'
                                        }`}>
                                        <input
                                            type="radio"
                                            name={`resolution-${i}`}
                                            checked={resolutions.get(i) === 'keep_both'}
                                            onChange={() => setResolution(i, txIndex, 'keep_both')}
                                            className="accent-emerald-500"
                                        />
                                        <span className="text-xs text-emerald-300">Keep Both</span>
                                    </label>
                                </div>
                            </div>
                            {/* Status message based on resolution */}
                            {resolutions.get(i) === 'skip_new' && (
                                <div className="mt-2 text-xs text-slate-400 bg-slate-500/10 px-2 py-1 rounded">
                                    📋 Keeping existing - new upload will be skipped
                                </div>
                            )}
                            {resolutions.get(i) === 'replace_existing' && (
                                <div className="mt-2 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                                    🔄 Will delete existing and save new upload
                                </div>
                            )}
                            {resolutions.get(i) === 'keep_both' && (
                                <div className="mt-2 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                                    ✅ Both transactions will be saved
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Summary */}
            <div className="holo-card p-4 bg-slate-900/50">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Total Uploaded:</span>
                    <span className="text-white font-medium">{transactions.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted">Excluded (duplicates):</span>
                    <span className="text-red-400 font-medium">{excludedIndices.size}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1 pt-2 border-t border-white/10">
                    <span className="text-muted">Will be saved:</span>
                    <span className="text-emerald-400 font-bold">{transactions.length - excludedIndices.size}</span>
                </div>
            </div>
        </div>
    );
}
