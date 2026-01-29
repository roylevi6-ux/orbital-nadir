'use client';

import { useState, useMemo, useEffect } from 'react';
import { Transaction } from '@/app/actions/get-transactions';
import { approveTransaction } from '@/app/actions/review-transaction';
import { suggestExpenseLinks, linkReimbursementToExpense, ExpenseSuggestion } from '@/app/actions/suggest-expense-links';
import { suggestCategory } from '@/app/actions/suggest-category';
import { manualReconcileTransactions } from '@/app/actions/p2p-reconciliation';
import { updateTransactionStatus, bulkUpdateStatus, bulkUpdateCategory } from '@/app/actions/bulk-status-update';
import { toast } from 'sonner';
import {
    Search,
    Filter,
    Download,
    Receipt,
    Calendar,
    Store,
    Tag,
    FileText,
    Coins,
    Zap,
    SearchX
} from 'lucide-react';

interface TransactionWithLink extends Transaction {
    is_linked?: boolean;
    link_id?: string;
    merchant_normalized?: string;
}

type SortField = 'date' | 'amount' | 'merchant' | 'category';
type SortOrder = 'asc' | 'desc';

// Status Badge Component with click-to-toggle (optimistic updates)
const StatusBadge = ({ status, txId, onOptimisticUpdate }: { status: string, txId: string, onOptimisticUpdate: (id: string, newStatus: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [localStatus, setLocalStatus] = useState(status);

    // Sync with prop changes
    useEffect(() => {
        setLocalStatus(status);
    }, [status]);

    const handleStatusChange = async (newStatus: 'verified' | 'verified_by_ai' | 'pending') => {
        // Optimistic update - change UI immediately
        setLocalStatus(newStatus);
        setIsOpen(false);
        onOptimisticUpdate(txId, newStatus);

        // Sync in background (no await, no blocking)
        updateTransactionStatus(txId, newStatus).then(result => {
            if (!result.success) {
                // Revert on error
                setLocalStatus(status);
                toast.error('Failed to update status');
            }
        });
    };

    const getStatusDisplay = () => {
        switch (localStatus) {
            case 'verified':
                return { label: '✅ Verified', color: 'var(--neon-green)' };
            case 'verified_by_ai':
                return { label: '🤖 AI Verified', color: 'var(--neon-blue)' };
            default:
                return { label: '⏳ Pending', color: 'var(--neon-warning)' };
        }
    };

    const { label, color } = getStatusDisplay();

    return (
        <div className="relative inline-block">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all hover:scale-105`}
                style={{
                    backgroundColor: `${color}20`,
                    color: color,
                    borderColor: `${color}40`
                }}
            >
                {label}
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 left-0 w-36 bg-[var(--bg-primary)] border border-[var(--border-neon)] rounded-lg shadow-xl overflow-hidden">
                    <button
                        onClick={() => handleStatusChange('verified')}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--neon-green)]/20 text-[var(--neon-green)] transition-colors"
                    >
                        ✅ Verified
                    </button>
                    <button
                        onClick={() => handleStatusChange('verified_by_ai')}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--neon-blue)]/20 text-[var(--neon-blue)] transition-colors"
                    >
                        🤖 AI Verified
                    </button>
                    <button
                        onClick={() => handleStatusChange('pending')}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--neon-warning)]/20 text-[var(--neon-warning)] transition-colors"
                    >
                        ⏳ Pending
                    </button>
                </div>
            )}
        </div>
    );
};

// Icon helper
const SortIcon = ({ column, currentSort, currentOrder }: { column: SortField, currentSort: SortField, currentOrder: SortOrder }) => {
    if (currentSort !== column) return <span className="text-[var(--text-muted)] ml-1 opacity-20">⇅</span>;
    return <span className="ml-1 text-[var(--neon-blue)] drop-shadow-[0_0_8px_var(--neon-blue)]">{currentOrder === 'asc' ? '↑' : '↓'}</span>;
};

interface TransactionTableProps {
    transactions: Transaction[];
    incomeCategories: string[];
    expenseCategories: string[];
    onRefresh: () => void;
    onDelete: (id: string) => Promise<void>;
}

export default function TransactionTable({
    transactions: propTransactions,
    incomeCategories,
    expenseCategories,
    onRefresh,
    onDelete
}: TransactionTableProps) {
    // We maintain a local version for optimistic updates / linking
    const [localTransactions, setLocalTransactions] = useState<TransactionWithLink[]>([]);
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filter, setFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Advanced Filter State
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState<string>('');
    const [filterDateTo, setFilterDateTo] = useState<string>('');

    // Sync props to state, defaulting to empty array if null
    useEffect(() => {
        if (propTransactions) {
            setLocalTransactions(propTransactions as TransactionWithLink[]);
        } else {
            setLocalTransactions([]);
        }
    }, [propTransactions]);

    const allCategories = useMemo(() => {
        return Array.from(new Set([...(incomeCategories || []), ...(expenseCategories || [])])).sort();
    }, [incomeCategories, expenseCategories]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const toggleSelection = (id: string, selected: boolean) => {
        const newSelected = new Set(selectedIds);
        if (selected) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
    };

    const sortedTransactions = useMemo(() => {
        let result = [...localTransactions];

        if (filter) {
            const lowerFilter = filter.toLowerCase();
            result = result.filter(t =>
                t.merchant_normalized?.toLowerCase().includes(lowerFilter) ||
                t.merchant_raw?.toLowerCase().includes(lowerFilter) ||
                t.amount.toString().includes(lowerFilter)
            );
        }

        // Advanced Filters
        if (filterCategory) {
            result = result.filter(t => t.category === filterCategory);
        }
        if (filterStatus) {
            result = result.filter(t => t.status === filterStatus);
        }
        if (filterDateFrom) {
            const fromDate = new Date(filterDateFrom);
            result = result.filter(t => new Date(t.date) >= fromDate);
        }
        if (filterDateTo) {
            const toDate = new Date(filterDateTo);
            toDate.setHours(23, 59, 59, 999);
            result = result.filter(t => new Date(t.date) <= toDate);
        }

        result.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'date':
                    comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                    break;
                case 'amount':
                    comparison = a.amount - b.amount;
                    break;
                case 'merchant':
                    const merchA = a.merchant_normalized || a.merchant_raw || '';
                    const merchB = b.merchant_normalized || b.merchant_raw || '';
                    comparison = merchA.localeCompare(merchB);
                    break;
                case 'category':
                    const catA = a.category || '';
                    const catB = b.category || '';
                    comparison = catA.localeCompare(catB);
                    break;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [localTransactions, filter, sortField, sortOrder, filterCategory, filterStatus, filterDateFrom, filterDateTo]);

    // Export to CSV
    const handleExport = () => {
        if (sortedTransactions.length === 0) {
            toast.error('No transactions to export');
            return;
        }
        const headers = ['Date', 'Merchant', 'Category', 'Amount', 'Currency', 'Type', 'Status', 'Notes'];
        const rows = sortedTransactions.map(t => [
            t.date,
            t.merchant_normalized || t.merchant_raw,
            t.category || '',
            t.amount.toString(),
            t.currency,
            t.type,
            t.status,
            t.notes || ''
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${sortedTransactions.length} transactions`);
    };

    // Clear all filters
    const clearFilters = () => {
        setFilterCategory('');
        setFilterStatus('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilter('');
    };

    // Check if any filters are active
    const hasActiveFilters = filterCategory || filterStatus || filterDateFrom || filterDateTo;

    // Optimistic status update - update local state without refresh
    const handleOptimisticStatusUpdate = (txId: string, newStatus: string) => {
        setLocalTransactions(prev =>
            prev.map(tx => tx.id === txId ? { ...tx, status: newStatus } : tx)
        );
    };

    // Optimistic bulk status update
    const handleBulkStatusUpdate = (ids: Set<string>, newStatus: 'verified' | 'pending') => {
        // Optimistic update
        setLocalTransactions(prev =>
            prev.map(tx => ids.has(tx.id) ? { ...tx, status: newStatus } : tx)
        );
        setSelectedIds(new Set());

        // Sync in background
        bulkUpdateStatus(Array.from(ids), newStatus).then(result => {
            if (result.success) {
                toast.success(`Marked ${result.data.count} as ${newStatus}`);
            } else {
                toast.error('Failed to update');
                onRefresh(); // Revert by refreshing
            }
        });
    };

    // Optimistic bulk category update
    const handleBulkCategoryUpdate = (ids: Set<string>, newCategory: string) => {
        // Optimistic update
        setLocalTransactions(prev =>
            prev.map(tx => ids.has(tx.id) ? { ...tx, category: newCategory, status: 'verified' } : tx)
        );
        setSelectedIds(new Set());

        // Sync in background
        bulkUpdateCategory(Array.from(ids), newCategory).then(result => {
            if (result.success) {
                toast.success(`Set ${result.data.count} to "${newCategory}"`);
            } else {
                toast.error('Failed to update category');
                onRefresh(); // Revert by refreshing
            }
        });
    };

    // Manual reconciliation of exactly 2 transactions
    const handleManualReconcile = async () => {
        if (selectedIds.size !== 2) return;

        const ids = Array.from(selectedIds);
        const tx1 = localTransactions.find(t => t.id === ids[0]);
        const tx2 = localTransactions.find(t => t.id === ids[1]);

        if (!tx1 || !tx2) {
            toast.error('Could not find selected transactions');
            return;
        }

        // Confirm action
        const actionType = tx1.type !== tx2.type ? 'link as reimbursement' : 'merge as duplicates';
        if (!window.confirm(`This will ${actionType}. Continue?`)) {
            return;
        }

        try {
            const result = await manualReconcileTransactions(ids[0], ids[1]);
            if (result.success) {
                toast.success(result.action === 'merged' ? 'Transactions merged' : 'Reimbursement applied');
                setSelectedIds(new Set());
                onRefresh();
            } else {
                toast.error(result.error || 'Failed to reconcile');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to reconcile transactions');
        }
    };

    return (
        <div className="holo-card p-0 overflow-hidden">
            {/* Header Controls */}
            <div className="p-4 border-b border-[var(--border-neon)] flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-[var(--neon-purple)]" />
                    </div>
                    <input
                        type="text"
                        className="pl-10 pr-4 py-2 w-full bg-[var(--bg-card)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--neon-blue)] focus:border-[var(--neon-blue)]"
                        placeholder="🔍 Search transactions..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {selectedIds.size > 0 && (
                        <>
                            <button
                                onClick={() => handleBulkStatusUpdate(selectedIds, 'verified')}
                                className="flex items-center gap-2 px-3 py-2 bg-[var(--neon-green)]/20 hover:bg-[var(--neon-green)]/30 border border-[var(--neon-green)]/40 rounded-lg text-xs font-bold text-[var(--neon-green)] transition-all"
                            >
                                ✅ Mark Verified ({selectedIds.size})
                            </button>
                            <button
                                onClick={() => handleBulkStatusUpdate(selectedIds, 'pending')}
                                className="flex items-center gap-2 px-3 py-2 bg-[var(--neon-warning)]/20 hover:bg-[var(--neon-warning)]/30 border border-[var(--neon-warning)]/40 rounded-lg text-xs font-bold text-[var(--neon-warning)] transition-all"
                            >
                                ⏳ Mark Pending ({selectedIds.size})
                            </button>
                            <select
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleBulkCategoryUpdate(selectedIds, e.target.value);
                                        e.target.value = '';
                                    }
                                }}
                                className="px-3 py-2 bg-[var(--neon-purple)]/20 hover:bg-[var(--neon-purple)]/30 border border-[var(--neon-purple)]/40 rounded-lg text-xs font-bold text-[var(--neon-purple)] transition-all cursor-pointer"
                                defaultValue=""
                            >
                                <option value="" disabled>🏷️ Set Category ({selectedIds.size})</option>
                                {allCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            {selectedIds.size === 2 && (
                                <button
                                    onClick={handleManualReconcile}
                                    className="flex items-center gap-2 px-3 py-2 bg-[var(--neon-blue)]/20 hover:bg-[var(--neon-blue)]/30 border border-[var(--neon-blue)]/40 rounded-lg text-xs font-bold text-[var(--neon-blue)] transition-all"
                                >
                                    🔗 Reconcile (2)
                                </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={() => setShowFilterPanel(!showFilterPanel)}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-medium transition-all ${showFilterPanel || hasActiveFilters ? 'bg-[var(--neon-purple)]/20 border-[var(--neon-purple)]/40 text-[var(--neon-purple)]' : 'bg-[var(--bg-card)] border-[var(--border-glass)] text-[var(--text-primary)] hover:bg-white/10 hover:border-[var(--neon-purple)]'}`}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filter
                        {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[var(--neon-purple)]"></span>}
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)] hover:bg-white/10 border border-[var(--border-glass)] hover:border-[var(--neon-blue)] rounded-lg text-xs font-medium text-[var(--text-primary)] transition-all"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export
                    </button>
                </div>
            </div>

            {/* Filter Panel */}
            {showFilterPanel && (
                <div className="p-4 border-b border-[var(--border-neon)] bg-[var(--bg-card)]/50 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex flex-wrap gap-4 items-end">
                        <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Category</label>
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-glass)] rounded-lg text-sm text-[var(--text-primary)] min-w-[150px]"
                            >
                                <option value="">All Categories</option>
                                {allCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Status</label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-glass)] rounded-lg text-sm text-[var(--text-primary)] min-w-[120px]"
                            >
                                <option value="">All Statuses</option>
                                <option value="verified">✅ Verified</option>
                                <option value="pending">⏳ Pending</option>
                                <option value="flagged">🚩 Flagged</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">From Date</label>
                            <input
                                type="date"
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                                className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-glass)] rounded-lg text-sm text-[var(--text-primary)]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">To Date</label>
                            <input
                                type="date"
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                                className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-glass)] rounded-lg text-sm text-[var(--text-primary)]"
                            />
                        </div>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-2 text-xs text-[var(--neon-pink)] hover:bg-[var(--neon-pink)]/10 rounded-lg transition-colors"
                            >
                                Clear Filters
                            </button>
                        )}
                        <div className="ml-auto text-xs text-[var(--text-muted)]">
                            Showing {sortedTransactions.length} of {localTransactions.length} transactions
                        </div>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-[var(--border-neon)] bg-gradient-to-r from-[var(--neon-purple)]/10 to-[var(--neon-blue)]/10 text-left text-xs font-medium text-[var(--neon-purple)] uppercase tracking-wider">
                            <th className="px-6 py-4 w-12">
                                <input
                                    type="checkbox"
                                    className="rounded border-[var(--border-neon)] bg-[var(--bg-card)] text-[var(--neon-purple)] focus:ring-[var(--neon-purple)] cursor-pointer"
                                    checked={selectedIds.size === localTransactions.length && localTransactions.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedIds(new Set(localTransactions.map(t => t.id)));
                                        } else {
                                            setSelectedIds(new Set());
                                        }
                                    }}
                                />
                            </th>
                            <th
                                className="px-6 py-4 cursor-pointer hover:text-[var(--neon-blue)] transition-colors group"
                                onClick={() => handleSort('date')}
                            >
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" /> Date
                                    <SortIcon column="date" currentSort={sortField} currentOrder={sortOrder} />
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 cursor-pointer hover:text-[var(--neon-pink)] transition-colors group"
                                onClick={() => handleSort('merchant')}
                            >
                                <div className="flex items-center gap-2">
                                    <Store className="w-4 h-4" /> Merchant
                                    <SortIcon column="merchant" currentSort={sortField} currentOrder={sortOrder} />
                                </div>
                            </th>
                            <th
                                className="px-6 py-4 cursor-pointer hover:text-[var(--neon-blue)] transition-colors group"
                                onClick={() => handleSort('category')}
                            >
                                <div className="flex items-center gap-2">
                                    <Tag className="w-4 h-4" /> Category
                                    <SortIcon column="category" currentSort={sortField} currentOrder={sortOrder} />
                                </div>
                            </th>
                            <th className="px-6 py-4"><div className="flex items-center gap-2"><FileText className="w-4 h-4" /> Notes</div></th>
                            <th
                                className="px-6 py-4 text-right cursor-pointer hover:text-[var(--neon-pink)] transition-colors group"
                                onClick={() => handleSort('amount')}
                            >
                                <div className="flex items-center justify-end gap-2">
                                    <Coins className="w-4 h-4" /> Amount
                                    <SortIcon column="amount" currentSort={sortField} currentOrder={sortOrder} />
                                </div>
                            </th>
                            <th className="px-6 py-4 text-center"><div className="flex items-center justify-center gap-2"><Zap className="w-4 h-4" /> Status</div></th>
                            <th className="px-6 py-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-glass)]">
                        {sortedTransactions.map((tx) => (
                            <TransactionRow
                                key={tx.id}
                                tx={tx}
                                allCategories={allCategories}
                                incomeCategories={incomeCategories || []}
                                expenseCategories={expenseCategories || []}
                                onOptimisticStatusUpdate={handleOptimisticStatusUpdate}
                                onRefresh={onRefresh}
                                onDelete={onDelete}
                                selected={selectedIds.has(tx.id)}
                                onSelect={toggleSelection}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {localTransactions.length === 0 && (
                <div className="p-12 text-center">
                    <div className="icon-glow w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <SearchX className="w-8 h-8 text-[var(--text-muted)]" />
                    </div>
                    <h3 className="text-[var(--text-primary)] font-medium mb-1">No transactions found</h3>
                    <p className="text-[var(--text-muted)] text-sm">Try adjusting your filters or search query</p>
                </div>
            )}
        </div>
    );
}

// Subcomponent: TransactionRow
function TransactionRow({
    tx,
    allCategories,
    incomeCategories,
    expenseCategories,
    onOptimisticStatusUpdate,
    onRefresh,
    onDelete,
    selected,
    onSelect
}: {
    tx: TransactionWithLink;
    allCategories: string[];
    incomeCategories: string[];
    expenseCategories: string[];
    onOptimisticStatusUpdate: (id: string, newStatus: string) => void;
    onRefresh: () => void;
    onDelete: (id: string) => Promise<void>;
    selected?: boolean;
    onSelect?: (id: string, selected: boolean) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [merchant, setMerchant] = useState(tx.merchant_normalized || tx.merchant_raw || '');
    const [category, setCategory] = useState(tx.category || '');
    const [notes, setNotes] = useState(tx.notes || '');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [learnRule, setLearnRule] = useState(false);

    // Classification States
    const [isIncomeView, setIsIncomeView] = useState(tx.type === 'income');
    const [classificationMode, setClassificationMode] = useState<'chooser' | 'editor'>('chooser');
    const [incomeSubtype, setIncomeSubtype] = useState<'income' | 'reimbursement' | null>(null);

    // Dependent states
    const [currentDisplayCategories, setCurrentDisplayCategories] = useState(allCategories);
    const [expenseSuggestions, setExpenseSuggestions] = useState<ExpenseSuggestion[]>([]);
    const [selectedExpenseLink, setSelectedExpenseLink] = useState<string | null>(null);

    // AI Suggestions
    useEffect(() => {
        if (!isEditing || merchant.length < 3 || incomeSubtype) return;

        const timer = setTimeout(async () => {
            const temps = await suggestCategory(merchant, tx.amount, tx.currency);
            if (temps.length) setSuggestions(temps);
        }, 600);
        return () => clearTimeout(timer);
    }, [merchant, isEditing, incomeSubtype, tx.amount, tx.currency]);

    // Handle Delete
    const handleDeleteClick = async () => {
        if (window.confirm('Are you sure you want to delete?')) {
            setLoading(true);
            await onDelete(tx.id);
            setLoading(false);
        }
    };

    // Handle Income Logic
    const handleSubtypeSelect = async (subtype: 'income' | 'reimbursement') => {
        setIncomeSubtype(subtype);
        setClassificationMode('editor');

        if (subtype === 'income') {
            setCurrentDisplayCategories(incomeCategories);
        } else {
            setCurrentDisplayCategories(expenseCategories);
            // Fetch Reimbursement link suggestions
            try {
                const res = await suggestExpenseLinks(tx.id, tx.amount);
                if (res?.suggestions) setExpenseSuggestions(res.suggestions);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await approveTransaction(
                tx.id,
                category,
                merchant,
                notes,
                learnRule
            );
            if (res.success) {
                if (selectedExpenseLink) {
                    await linkReimbursementToExpense(tx.id, selectedExpenseLink);
                }
                setIsEditing(false);
                onRefresh(); // Full refresh needed after category/merchant edit
            } else {
                toast.error('Error: ' + res.error);
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to save transaction');
        } finally {
            setLoading(false);
        }
    };

    // View Mode
    if (!isEditing) {
        return (
            <tr className={`group border-b border-[var(--border-glass)] hover:bg-[var(--neon-purple)]/5 transition-colors ${selected ? 'bg-[var(--neon-purple)]/10 border-l-2 border-l-[var(--neon-purple)]' : ''}`}>
                <td className="px-6 py-4">
                    <input
                        type="checkbox"
                        checked={selected || false}
                        onChange={(e) => onSelect && onSelect(tx.id, e.target.checked)}
                        className="rounded border-[var(--border-neon)] bg-[var(--bg-card)] text-[var(--neon-purple)] focus:ring-[var(--neon-purple)] transition-colors cursor-pointer"
                    />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                    {new Date(tx.date).toLocaleDateString('en-GB')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text-primary)] max-w-[200px]" title={tx.merchant_raw}>
                    <div className="flex items-center gap-2">
                        <span className="truncate">{tx.merchant_normalized || tx.merchant_raw}</span>
                        {tx.receipt_id && (
                            <span title="Matched with email receipt" className="flex-shrink-0 text-emerald-400 opacity-70 hover:opacity-100 transition-opacity">
                                <Receipt size={14} />
                            </span>
                        )}
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tx.category ? 'bg-[var(--neon-purple)]/20 text-[var(--neon-purple)] border border-[var(--neon-purple)]/30' : 'bg-[var(--neon-pink)]/20 text-[var(--neon-pink)] border border-[var(--neon-pink)]/30'}`}>
                        {tx.category || '❌ Uncategorized'}
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-muted)] max-w-[150px] truncate">
                    {tx.notes}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right">
                    <span className={tx.type === 'income' ? 'text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-green)] to-[var(--neon-blue)]' : 'text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-pink)] to-[var(--neon-purple)]'}>
                        {tx.amount} {tx.currency}
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                    <StatusBadge status={tx.status} txId={tx.id} onOptimisticUpdate={onOptimisticStatusUpdate} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                        <button
                            onClick={() => setIsEditing(true)}
                            className="text-[var(--neon-blue)] hover:text-[var(--neon-pink)] hover:scale-110 transition-all p-1"
                            title="Edit"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                        <button
                            onClick={handleDeleteClick}
                            disabled={loading}
                            className="text-[var(--neon-pink)] hover:text-[var(--neon-warning)] hover:scale-110 transition-all p-1"
                            title="Delete"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    // Edit Mode
    return (
        <tr className="bg-[var(--neon-purple)]/10 border-l-2 border-l-[var(--neon-purple)] shadow-[0_0_20px_rgba(120,119,198,0.3)] animate-in fade-in">
            <td className="px-6 py-4"></td>
            <td colSpan={6} className="px-6 py-4">
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{new Date(tx.date).toLocaleDateString('en-GB')}</span>
                        <span className={`font-bold tabular-nums ${tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {tx.amount} {tx.currency}
                        </span>
                    </div>

                    {/* Income Choice */}
                    {isIncomeView && classificationMode === 'chooser' && (
                        <div className="bg-slate-900/50 border border-indigo-500/30 rounded-lg p-4">
                            <p className="text-sm font-medium text-indigo-300 mb-3">💰 Is this received money:</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleSubtypeSelect('income')}
                                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 font-medium rounded-lg transition-all text-sm"
                                >
                                    <div>💵 Income</div>
                                    <div className="text-xs font-normal text-emerald-500/70">Salary, gift, etc.</div>
                                </button>
                                <button
                                    onClick={() => handleSubtypeSelect('reimbursement')}
                                    className="flex-1 px-4 py-3 bg-slate-800 hover:bg-orange-900/20 border border-orange-500/30 text-orange-400 font-medium rounded-lg transition-all text-sm"
                                >
                                    <div>🔄 Reimbursement</div>
                                    <div className="text-xs font-normal text-orange-500/70">Payback for shared expense</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Editor */}
                    {(!isIncomeView || classificationMode === 'editor') && (
                        <>
                            {/* Linked Expense Suggestion */}
                            {isIncomeView && incomeSubtype === 'reimbursement' && expenseSuggestions.length > 0 && (
                                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 mb-2">
                                    <p className="text-xs text-purple-300 mb-2">Select linked expense:</p>
                                    {expenseSuggestions.map(s => (
                                        <div
                                            key={s.transaction.id}
                                            className={`p-2 rounded border cursor-pointer mb-1 ${selectedExpenseLink === s.transaction.id ? 'border-purple-500 bg-purple-500/20' : 'border-white/10'}`}
                                            onClick={() => { setSelectedExpenseLink(s.transaction.id); setCategory(s.transaction.category || ''); }}
                                        >
                                            <div className="text-xs text-slate-200">{s.transaction.merchant_raw} - {s.transaction.amount}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input className="input-base" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Merchant" />
                                <input className="input-base" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" />
                                <select className="input-base" value={category} onChange={e => setCategory(e.target.value)}>
                                    <option value="">Select Category</option>
                                    {suggestions.length > 0 && (
                                        <optgroup label="AI Suggestions">
                                            {suggestions.map(s => <option key={s} value={s}>✨ {s}</option>)}
                                        </optgroup>
                                    )}
                                    <optgroup label="All Categories">
                                        {currentDisplayCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </optgroup>
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 mt-2">
                                <button onClick={() => { setIsEditing(false); setClassificationMode('chooser'); }} className="px-3 py-1.5 text-sm text-slate-400 hover:text-white">Cancel</button>
                                <button onClick={handleSave} disabled={loading} className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded">
                                    {loading ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            <div className="mt-2">
                                <label className="flex items-center gap-2 text-xs text-slate-400">
                                    <input type="checkbox" checked={learnRule} onChange={e => setLearnRule(e.target.checked)} className="rounded bg-slate-800 border-slate-600 text-violet-500" />
                                    Always categorize <b>{merchant}</b> as <b>{category || '...'}</b>?
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
}
