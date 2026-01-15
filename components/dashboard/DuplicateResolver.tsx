'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getDuplicateGroups, mergeTransactionGroup, DuplicateGroup } from '@/app/actions/cleanup-duplicates';
import { toast } from 'sonner';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

export default function DuplicateResolver({ isOpen, onClose, onComplete }: Props) {
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [groups, setGroups] = useState<DuplicateGroup[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [resolving, setResolving] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [selectedType, setSelectedType] = useState<'expense' | 'income' | 'reimbursement' | null>(null);

    useEffect(() => {
        setMounted(true);
        if (isOpen) {
            loadDuplicates();
            loadCategories();
        } else {
            setGroups([]);
            setCurrentIndex(0);
            setSelectedCategory('');
            setSelectedType(null);
        }
    }, [isOpen]);

    const loadCategories = async () => {
        try {
            const { getCategoryNames } = await import('@/app/actions/review-transaction');
            const cats = await getCategoryNames('expense');
            setCategories(cats || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadDuplicates = async () => {
        setLoading(true);
        try {
            const data = await getDuplicateGroups();
            setGroups(data);
            if (data.length === 0) {
                toast.success('No duplicates found! 🎉');
                onClose();
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to search for duplicates');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const handleMerge = async () => {
        if (!groups[currentIndex]) return;

        setResolving(true);
        const group = groups[currentIndex];
        const primary = group.transactions[0];
        const others = group.transactions.slice(1).map(t => t.id);

        let finalType: 'income' | 'expense' | undefined = undefined;
        let finalCategory = selectedCategory;

        if (selectedType === 'expense') finalType = 'expense';
        if (selectedType === 'income') finalType = 'income';
        if (selectedType === 'reimbursement') {
            finalType = 'income';
            if (!finalCategory) finalCategory = 'Reimbursement';
        }

        try {
            await mergeTransactionGroup(primary.id, others, finalCategory || undefined, finalType);
            toast.success('Merged successfully');

            if (currentIndex < groups.length - 1) {
                setCurrentIndex(prev => prev + 1);
                setSelectedCategory('');
                setSelectedType(null);
            } else {
                toast.success('All duplicates resolved!');
                onComplete();
                onClose();
            }
        } catch (error) {
            toast.error('Failed to merge transactions');
        } finally {
            setResolving(false);
        }
    };

    const handleSkip = () => {
        if (currentIndex < groups.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setSelectedCategory('');
            setSelectedType(null);
        } else {
            onClose();
        }
    };

    if (!mounted || !isOpen) return null;

    return createPortal(
        <>
            {loading && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-white flex flex-col items-center gap-4 relative p-8 bg-slate-900/50 rounded-2xl border border-white/10">
                        <button
                            onClick={onClose}
                            className="absolute top-2 right-2 text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors"
                            title="Cancel"
                        >
                            ✕
                        </button>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                        <p>Scanning for duplicates...</p>
                    </div>
                </div>
            )}

            {!loading && groups.length > 0 && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span>🧹</span> Resolve Duplicates
                                </h3>
                                <p className="text-slate-400 text-sm mt-1">
                                    Group {currentIndex + 1} of {groups.length}
                                </p>
                            </div>
                            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Comparison List */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Potential Duplicates</label>
                                <div className="space-y-2">
                                    {groups[currentIndex].transactions.map((tx, idx) => (
                                        <div key={tx.id} className={`flex items-center justify-between p-3 rounded-xl border ${idx === 0 ? 'bg-violet-500/10 border-violet-500/30' : 'bg-slate-950/50 border-white/5'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${idx === 0 ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-800 text-slate-500'}`}>
                                                    {idx === 0 ? '★' : idx}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{tx.merchant_raw}</p>
                                                    <p className="text-xs text-slate-400">{tx.date} • {tx.type}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-mono font-bold ${tx.amount < 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                    {Math.abs(tx.amount).toFixed(2)}
                                                </p>
                                                {tx.category && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{tx.category}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Type Selection */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Set Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => setSelectedType('expense')}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selectedType === 'expense'
                                            ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                                            : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-white/5'}`}
                                    >
                                        Expense
                                    </button>
                                    <button
                                        onClick={() => setSelectedType('income')}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selectedType === 'income'
                                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                            : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-white/5'}`}
                                    >
                                        Income
                                    </button>
                                    <button
                                        onClick={() => setSelectedType('reimbursement')}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selectedType === 'reimbursement'
                                            ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                                            : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-white/5'}`}
                                    >
                                        Reimburse
                                    </button>
                                </div>
                            </div>

                            {/* Categorization */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Set Category (Optional)</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                >
                                    <option value="">
                                        {groups[currentIndex].transactions.find(t => t.category)?.category
                                            ? `Keep Existing: ${groups[currentIndex].transactions.find(t => t.category)?.category}`
                                            : 'Uncategorized (or Select...)'}
                                    </option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Merge Preview */}
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-slate-300">Merge Result Preview</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                        <label className="block text-xs text-slate-500 mb-1">Notes to Keep</label>
                                        <p className="text-sm text-white italic">
                                            {(() => {
                                                const uniqueNotes = new Set<string>();
                                                groups[currentIndex].transactions.forEach(t => t.notes && uniqueNotes.add(t.notes));
                                                return Array.from(uniqueNotes).join(' | ') || '(No notes)';
                                            })()}
                                        </p>
                                    </div>
                                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                        <label className="block text-xs text-slate-500 mb-1">Status</label>
                                        <p className="text-sm text-white">
                                            {groups[currentIndex].transactions.some(t => t.status === 'verified')
                                                ? '✅ Verified'
                                                : '⏳ Pending'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Controls */}
                        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                            <button
                                onClick={handleSkip}
                                className="px-4 py-2 text-slate-400 hover:text-white font-medium transition-colors"
                            >
                                Skip this Group
                            </button>

                            <button
                                onClick={handleMerge}
                                disabled={resolving}
                                className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 flex items-center gap-2"
                            >
                                {resolving ? 'Merging...' : 'Confirm Merge & Next'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
