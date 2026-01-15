'use client';

import { useState, useMemo, useEffect } from 'react';
import { updateTransactionCategory } from '@/app/actions/update-category';
import { bulkUpdateCategories } from '@/app/actions/bulk-update';
import { Check, CheckCircle2, ChevronDown, ChevronRight, Tags, AlertCircle, ArrowRight, Filter, Search, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import CategorySelector from '@/components/ui/CategorySelector';
import { cn } from '@/lib/utils';

interface Transaction {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string;
    amount: number;
    currency: string;
    ai_suggestions?: string[];
    category?: string;
    status: string;
    confidence_score?: number;
    type?: string;
    is_reimbursement?: boolean;
}

interface Props {
    flaggedTransactions: Transaction[];
    skippedTransactions: Transaction[];
}

export default function ReviewManager({ flaggedTransactions, skippedTransactions }: Props) {
    // start with a unified list
    const [transactions, setTransactions] = useState<Transaction[]>([...flaggedTransactions, ...skippedTransactions]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    // State for filtering and sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [filterConfidence, setFilterConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'skipped'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction | 'confidence', direction: 'asc' | 'desc' }>({ key: 'confidence', direction: 'desc' });

    // Derived State
    const filteredAndSortedTransactions = useMemo(() => {
        let result = [...transactions];

        // 1. Filter
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(t =>
                t.merchant_raw.toLowerCase().includes(lowerTerm) ||
                (t.merchant_normalized || '').toLowerCase().includes(lowerTerm) ||
                t.amount.toString().includes(lowerTerm)
            );
        }

        if (filterConfidence !== 'all') {
            result = result.filter(t => {
                const score = t.confidence_score || 0;
                if (filterConfidence === 'high') return score >= 90;
                if (filterConfidence === 'medium') return score >= 70 && score < 90;
                if (filterConfidence === 'low') return score < 70;
                return true;
            });
        }

        if (filterStatus !== 'all') {
            result = result.filter(t => {
                if (filterStatus === 'pending') return t.status === 'pending' || t.status === 'flagged';
                return t.status === filterStatus;
            });
        }

        // 2. Sort
        result.sort((a, b) => {
            const { key, direction } = sortConfig;
            let valA: any = a[key as keyof Transaction];
            let valB: any = b[key as keyof Transaction];

            // Handle special cases
            if (key === 'confidence') {
                valA = a.confidence_score || 0;
                valB = b.confidence_score || 0;
            } else if (key === 'category') { // Treat undefined as empty string for sort
                valA = a.category || '';
                valB = b.category || '';
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Default secondary sort: Date desc
        if (sortConfig.key !== 'date') {
            result.sort((a, b) => {
                // Stable sort for equal primary keys?
                // JS sort is stable in modern browsers, but let's manual secondary
                const timeA = new Date(a.date).getTime();
                const timeB = new Date(b.date).getTime();
                return timeB - timeA;
            });
        }

        return result;
    }, [transactions, searchTerm, filterConfidence, filterStatus, sortConfig]);

    const handleSort = (key: keyof Transaction | 'confidence') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    // ... (keep handleSelectAll using filteredAndSortedTransactions to act on visible items?)
    // Usually "Select All" selects visible items.
    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(filteredAndSortedTransactions.map(t => t.id)));
        else setSelectedIds(new Set());
    };

    // ... (keep usage of selectedIds)

    // Rename 'sortedTransactions' variable usage in render to 'filteredAndSortedTransactions'


    const handleSelectRow = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSingleApprove = async (id: string, category?: string) => {
        if (!category) {
            toast.error('Please select a category first');
            return;
        }

        // Optimistic
        setTransactions(prev => prev.filter(t => t.id !== id));
        toast.success('Transaction approved');

        try {
            await updateTransactionCategory(id, category, undefined, 'categorized');
        } catch (e) {
            toast.error('Failed to save');
            // Revert logic could be added here
        }
    };

    const handleSkip = async (id: string) => {
        // Optimistic
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'skipped' } : t));
        toast.success('Transaction skipped');

        try {
            await updateTransactionCategory(id, null, null, 'skipped');
        } catch (e) {
            toast.error('Failed to skip');
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        const toastId = toast.loading('Processing...');

        try {
            const selectedTxs = transactions.filter(t => selectedIds.has(t.id));
            const valid = selectedTxs.filter(t => t.category);

            if (valid.length === 0) {
                toast.error('No categories selected for these items.', { id: toastId });
                setLoading(false);
                return;
            }

            // Optimistic
            setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
            setSelectedIds(new Set());

            await Promise.all(valid.map(tx =>
                updateTransactionCategory(tx.id, tx.category!, tx.merchant_normalized, 'categorized')
            ));

            toast.success(`Approved ${valid.length} transactions`, { id: toastId });
        } catch (e) {
            toast.error('Failed to update', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const handleBulkSkip = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        const toastId = toast.loading('Skipping...');

        try {
            // Optimistic - update status to skipped locally
            setTransactions(prev => prev.map(t =>
                selectedIds.has(t.id) ? { ...t, status: 'skipped' } : t
            ));

            // If we are filtering by 'flagged', they might disappear from view, which is good.
            const itemsToSkip = transactions.filter(t => selectedIds.has(t.id)).map(t => ({ id: t.id }));

            setSelectedIds(new Set());

            await bulkUpdateCategories(itemsToSkip, null, 'skipped');

            toast.success(`Skipped ${itemsToSkip.length} transactions`, { id: toastId });
        } catch (e) {
            toast.error('Failed to skip', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    const handleBulkCategoryChange = async (category: string) => {
        if (selectedIds.size === 0) return;

        // Update local state for all selected
        setTransactions(prev => prev.map(t =>
            selectedIds.has(t.id) ? { ...t, category } : t
        ));

        toast.success(`Updated category for ${selectedIds.size} items`);
    };

    const handleCategoryChange = (id: string, newCategory: string) => {
        // 1. Update local state
        setTransactions(prev => prev.map(t =>
            t.id === id ? { ...t, category: newCategory } : t
        ));

        // 2. Check for other items with same merchant (normalized match)
        const normalize = (s?: string) => s?.trim().toLowerCase() || '';
        const tx = transactions.find(t => t.id === id);
        if (!tx) return;

        const matchKey = normalize(tx.merchant_normalized) || normalize(tx.merchant_raw);
        if (!matchKey) return;

        const matches = transactions.filter(t =>
            t.id !== id &&
            !t.category && // Only suggest if not already categorized
            (normalize(t.merchant_normalized) === matchKey || normalize(t.merchant_raw) === matchKey)
        );

        if (matches.length > 0) {
            toast('Apply to similar transactions?', {
                action: {
                    label: `Apply to ${matches.length}`,
                    onClick: () => {
                        setTransactions(prev => prev.map(t =>
                            (normalize(t.merchant_normalized) === matchKey || normalize(t.merchant_raw) === matchKey)
                                ? { ...t, category: newCategory }
                                : t
                        ));
                        toast.success(`Updated ${matches.length} similar items`);
                    }
                },
                description: `Found ${matches.length} other transactions from "${tx.merchant_raw}"`
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Extended Toolbar */}
            <div className={cn(
                "sticky top-0 z-20 p-4 transition-all duration-300",
                selectedIds.size > 0
                    ? "bg-violet-950/80 backdrop-blur-2xl translate-y-2 rounded-2xl border border-violet-500/20 shadow-2xl shadow-violet-900/20"
                    : "bg-slate-900/60 backdrop-blur-xl border-b border-white/5 -mx-6 px-6"
            )}>
                <div className="flex items-center justify-between gap-4">

                    {/* Left: Search & Select */}
                    <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-3 pl-1">
                            <input
                                type="checkbox"
                                checked={filteredAndSortedTransactions.length > 0 && selectedIds.size === filteredAndSortedTransactions.length}
                                onChange={(e) => handleSelectAll(e.target.checked)}
                                className="rounded border-white/20 bg-white/5 checked:bg-violet-500 hover:border-violet-400 focus:ring-0 w-5 h-5 transition-colors cursor-pointer"
                            />
                            <span className={cn("text-sm font-medium transition-colors whitespace-nowrap", selectedIds.size > 0 ? "text-violet-200" : "text-slate-400")}>
                                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Select All"}
                            </span>
                        </div>

                        <div className="h-6 w-px bg-white/10 mx-2" />

                        {/* Search Input */}
                        <div className="relative group max-w-sm w-full transition-all duration-300 focus-within:scale-[1.02]">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search merchant or amount..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-xl leading-5 bg-slate-900/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:bg-slate-900 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 text-sm transition-all shadow-sm"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex items-center gap-2">
                            <select
                                value={filterConfidence}
                                onChange={(e) => setFilterConfidence(e.target.value as any)}
                                className="bg-slate-900/50 border border-white/10 text-slate-300 text-xs rounded-xl focus:ring-violet-500 focus:border-violet-500 block px-3 py-2 hover:bg-slate-800/50 transition-colors cursor-pointer outline-none"
                            >
                                <option value="all">All Confidence</option>
                                <option value="high">High Match (90%+)</option>
                                <option value="medium">Medium Match (70-89%)</option>
                                <option value="low">Low Match (&lt;70%)</option>
                            </select>

                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value as any)}
                                className="bg-slate-900/50 border border-white/10 text-slate-300 text-xs rounded-xl focus:ring-violet-500 focus:border-violet-500 block px-3 py-2 hover:bg-slate-800/50 transition-colors cursor-pointer outline-none"
                            >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="skipped">Skipped</option>
                            </select>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Bulk Category Selector */}
                                <div className="w-[220px]">
                                    <CategorySelector
                                        onChange={handleBulkCategoryChange}
                                        placeholder="Set Category for All..."
                                    />
                                </div>

                                <button
                                    onClick={handleBulkSkip}
                                    disabled={loading}
                                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border border-white/5 hover:border-white/10"
                                >
                                    <SkipForward className="w-4 h-4" />
                                    Skip
                                </button>

                                <button
                                    onClick={handleBulkApprove}
                                    disabled={loading}
                                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95 border border-emerald-400/20"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Approve
                                </button>
                            </div>
                        ) : (
                            <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs text-slate-400 flex items-center gap-2 font-medium">
                                <Filter className="w-3 h-3" />
                                {filteredAndSortedTransactions.length} Pending
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden border border-white/5 bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-xl shadow-black/20">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-950/30 border-b border-white/5 font-semibold tracking-wider">
                        <tr>
                            <th className="px-6 py-5 w-14"></th>
                            <th
                                className="px-6 py-5 w-32 cursor-pointer hover:text-violet-300 transition-colors group select-none"
                                onClick={() => handleSort('date')}
                            >
                                <div className="flex items-center gap-2">
                                    Date
                                    <span className={cn("transition-opacity", sortConfig.key === 'date' ? "opacity-100 text-violet-400" : "opacity-0 group-hover:opacity-50")}>
                                        {sortConfig.key === 'date' && sortConfig.direction === 'asc' ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                                    </span>
                                </div>
                            </th>
                            <th
                                className="px-6 py-5 cursor-pointer hover:text-violet-300 transition-colors group select-none"
                                onClick={() => handleSort('merchant_raw')}
                            >
                                <div className="flex items-center gap-2">
                                    Merchant
                                    <span className={cn("transition-opacity", sortConfig.key === 'merchant_raw' ? "opacity-100 text-violet-400" : "opacity-0 group-hover:opacity-50")}>
                                        {sortConfig.key === 'merchant_raw' && sortConfig.direction === 'asc' ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                                    </span>
                                </div>
                            </th>
                            <th
                                className="px-6 py-5 w-36 cursor-pointer hover:text-violet-300 transition-colors group select-none"
                                onClick={() => handleSort('amount')}
                            >
                                <div className="flex items-center gap-2">
                                    Amount
                                    <span className={cn("transition-opacity", sortConfig.key === 'amount' ? "opacity-100 text-violet-400" : "opacity-0 group-hover:opacity-50")}>
                                        {sortConfig.key === 'amount' && sortConfig.direction === 'asc' ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                                    </span>
                                </div>
                            </th>
                            <th className="px-6 py-5 w-[280px]">Category</th>

                            <th className="px-6 py-5 w-28 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredAndSortedTransactions.map((tx, idx) => {
                            const score = tx.confidence_score || 0;
                            let matchType = 'Low';
                            let badgeColor = 'bg-slate-800/80 text-slate-400 border-slate-700 ring-1 ring-inset ring-slate-700/50';

                            if (score >= 90) {
                                matchType = 'High';
                                badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 ring-1 ring-inset ring-emerald-500/20 shadow-[0_0_12px_-3px_rgba(16,185,129,0.2)]';
                            } else if (score >= 70) {
                                matchType = 'Medium';
                                badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20 ring-1 ring-inset ring-amber-500/20'; // Suggested
                            }

                            if (tx.status === 'skipped') {
                                badgeColor = 'bg-slate-800 text-slate-500 border-slate-700 font-normal italic opacity-75';
                                matchType = 'Skipped';
                            }

                            return (
                                <tr
                                    key={tx.id}
                                    style={{ animationDelay: `${idx * 15}ms` }}
                                    className={cn(
                                        "group transition-all duration-200 hover:bg-white/[0.03] animate-in fade-in slide-in-from-bottom-2",
                                        selectedIds.has(tx.id) && "bg-violet-500/[0.08] hover:bg-violet-500/[0.12]"
                                    )}
                                >
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(tx.id)}
                                            onChange={() => handleSelectRow(tx.id)}
                                            className="rounded border-white/20 bg-white/5 checked:bg-violet-500 hover:border-violet-400 focus:ring-0 w-5 h-5 transition-all opacity-40 group-hover:opacity-100 data-[state=checked]:opacity-100 cursor-pointer"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-slate-300 font-mono text-xs opacity-90">
                                                {new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-mono">
                                                {new Date(tx.date).getFullYear()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-200 group-hover:text-white transition-colors">
                                        <div className="truncate max-w-[240px]" title={tx.merchant_raw}>
                                            {tx.merchant_raw}
                                        </div>
                                        {tx.merchant_normalized && tx.merchant_normalized !== tx.merchant_raw && (
                                            <div className="text-xs text-slate-500 font-normal mt-0.5 flex items-center gap-1">
                                                <ArrowRight className="w-3 h-3 opacity-50" />
                                                {tx.merchant_normalized}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={cn(
                                            "text-sm font-medium tabular-nums tracking-tight",
                                            tx.amount < 0 || (tx.type === 'expense' && tx.is_reimbursement) ? "text-emerald-400" : "text-slate-200"
                                        )}>
                                            {tx.amount < 0 ? '-' : ''}
                                            <span className="text-sm">{Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            <span className="text-xs ml-1 opacity-70">{tx.currency}</span>

                                            {(tx.is_reimbursement || (tx.amount < 0 && tx.type === 'expense')) && (
                                                <div className="mt-1">
                                                    <span className="text-[9px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
                                                        REFUND
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="min-w-[200px]">
                                            <CategorySelector
                                                value={tx.category || ''}
                                                placeholder="Select Category..."
                                                onChange={(val) => handleCategoryChange(tx.id, val)}
                                            />
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all focus-within:opacity-100 scale-95 group-hover:scale-100">
                                            <button
                                                onClick={() => handleSkip(tx.id)}
                                                className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-transparent hover:border-slate-600 text-slate-400 hover:text-slate-200 transition-all active:scale-95 shadow-lg"
                                                title="Skip for now"
                                            >
                                                <SkipForward className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleSingleApprove(tx.id, tx.category)}
                                                className="p-2 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 hover:text-emerald-300 transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
                                                title="Approve Transaction"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {transactions.length === 0 && (
                    <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center border border-white/5">
                            <CheckCircle2 className="w-8 h-8 text-slate-600" />
                        </div>
                        <div>
                            <p className="text-lg font-medium text-slate-300">All caught up!</p>
                            <p className="text-sm opacity-60">No transactions to review.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
