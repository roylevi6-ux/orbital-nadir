'use client';

import { useState, useEffect } from 'react';
import { Transaction } from '@/app/actions/get-transactions';
import { approveTransaction } from '@/app/actions/review-transaction';
import { suggestExpenseLinks, linkReimbursementToExpense } from '@/app/actions/suggest-expense-links';

interface Props {
    transactions: Transaction[];
    expenseCategories: string[];
    incomeCategories: string[];
    onRefresh: (silent?: boolean) => void;
    onDelete?: (transactionId: string) => Promise<void>;
}

export default function TransactionTable({ transactions, expenseCategories, incomeCategories, onRefresh, onDelete }: Props) {
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction | 'merchant', direction: 'asc' | 'desc' } | null>(null);
    // Filter State
    const [filters, setFilters] = useState({
        date: '',
        merchant: '',
        category: '',
        notes: '',
        amount: '',
        status: ''
    });
    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);

    const handleSort = (key: keyof Transaction | 'merchant') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Derived Data: Filter THEN Sort
    const filteredData = transactions.filter(tx => {
        // Date
        if (filters.date && !tx.date.includes(filters.date)) return false;
        // Merchant
        const merch = (tx.merchant_normalized || tx.merchant_raw).toLowerCase();
        if (filters.merchant && !merch.includes(filters.merchant.toLowerCase())) return false;
        // Category
        if (filters.category && !tx.category?.toLowerCase().includes(filters.category.toLowerCase())) return false;
        // Notes
        if (filters.notes && !tx.notes?.toLowerCase().includes(filters.notes.toLowerCase())) return false;
        // Amount
        if (filters.amount && !tx.amount.toString().includes(filters.amount)) return false;
        // Status
        if (filters.status && !tx.status.toLowerCase().includes(filters.status.toLowerCase())) return false;

        return true;
    });

    const sortedTransactions = [...filteredData].sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;

        let valA: any = a[key as keyof Transaction];
        let valB: any = b[key as keyof Transaction];

        // Custom handling for merchant (normalized or raw)
        if (key === 'merchant') {
            valA = a.merchant_normalized || a.merchant_raw;
            valB = b.merchant_normalized || b.merchant_raw;
        }

        // Handle nulls safely
        if (valA == null) valA = '';
        if (valB == null) valB = '';

        // Handle string comparison
        if (typeof valA === 'string') {
            return direction === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
        }
        // Handle number comparison
        if (typeof valA === 'number') {
            return direction === 'asc' ? valA - valB : valB - valA;
        }
        return 0;
    });

    // Selection Handlers
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = new Set(sortedTransactions.map(tx => tx.id));
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) newSelected.add(id);
        else newSelected.delete(id);
        setSelectedIds(newSelected);
    };

    // Bulk Action Handler
    const handleBulkApply = async () => {
        if (!bulkCategory || selectedIds.size === 0) return;
        setBulkLoading(true);

        const { bulkUpdateTransactions } = await import('@/app/actions/bulk-actions');
        const res = await bulkUpdateTransactions(Array.from(selectedIds), bulkCategory);

        if (res.success) {
            setSelectedIds(new Set());
            setBulkCategory('');
            onRefresh(true); // Silent refresh
        } else {
            alert('Bulk update failed: ' + res.error);
        }
        setBulkLoading(false);
    };

    // Helper to render sort arrow
    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig?.key !== column) return <span className="text-slate-600 ml-1 opacity-20">⇅</span>;
        return <span className="ml-1 text-cyan-400 drop-shadow-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    if (transactions.length === 0) {
        return <div className="card p-12 text-center text-muted">No transactions found.</div>;
    }

    return (
        <div className="card overflow-hidden relative shadow-2xl border border-white/5 bg-slate-900/40 backdrop-blur-xl">
            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-violet-950/90 backdrop-blur-2xl text-white px-6 py-3 rounded-full shadow-[0_0_40px_rgba(139,92,246,0.4)] border border-violet-500/30 flex items-center gap-4 animate-in slide-in-from-bottom-6 zoom-in-95">
                    <span className="font-bold text-sm bg-violet-500/20 text-violet-200 px-3 py-1 rounded-full border border-violet-500/20">{selectedIds.size} selected</span>
                    <div className="h-4 w-px bg-white/10"></div>
                    <select
                        className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer text-slate-200 hover:text-white transition-colors"
                        value={bulkCategory}
                        onChange={e => setBulkCategory(e.target.value)}
                    >
                        <option value="" className="text-slate-900 bg-slate-900">Apply category...</option>
                        <optgroup label="Expenses" className="text-slate-900 bg-slate-900">
                            {expenseCategories.map(c => <option key={c} value={c} className="text-slate-900 bg-slate-900">{c}</option>)}
                        </optgroup>
                    </select>
                    <button
                        onClick={handleBulkApply}
                        disabled={!bulkCategory || bulkLoading}
                        className="bg-white text-violet-950 px-5 py-1.5 rounded-full text-xs font-bold hover:bg-violet-50 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        {bulkLoading ? 'Saving...' : 'Apply'}
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-violet-300 hover:text-white ml-2 p-1 hover:bg-white/10 rounded-full transition-colors">✕</button>
                </div>
            )}

            <div className="overflow-x-auto min-h-[500px] custom-scrollbar">
                <table className="min-w-full divide-y divide-white/5">
                    <thead className="bg-slate-950/80 backdrop-blur-xl sticky top-0 z-20">
                        <tr>
                            <th className="px-6 py-4 w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 transition-colors cursor-pointer"
                                    checked={sortedTransactions.length > 0 && selectedIds.size === sortedTransactions.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th onClick={() => handleSort('date')} className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none">
                                Date <SortIcon column="date" />
                            </th>
                            <th onClick={() => handleSort('merchant')} className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none">
                                Description <SortIcon column="merchant" />
                            </th>
                            <th onClick={() => handleSort('category')} className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none">
                                Category <SortIcon column="category" />
                            </th>
                            <th onClick={() => handleSort('notes')} className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none">
                                Note <SortIcon column="notes" />
                            </th>
                            <th onClick={() => handleSort('amount')} className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none">
                                Amount <SortIcon column="amount" />
                            </th>
                            <th onClick={() => handleSort('status')} className="px-6 py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors select-none">
                                Status <SortIcon column="status" />
                            </th>
                            {onDelete && <th className="px-6 py-4 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>}
                        </tr>
                        {/* Filter Row - Integrated into Sticky Header */}
                        <tr className="border-t border-white/5 bg-slate-900/40">
                            <td className="px-2 py-2"></td>
                            <td className="px-2 py-2">
                                <input
                                    placeholder="Filter..."
                                    className="w-full text-xs bg-slate-800/50 border border-white/5 rounded px-2 py-1 text-slate-300 placeholder:text-slate-600 focus:bg-slate-800 focus:border-violet-500/50 transition-all font-medium"
                                    value={filters.date}
                                    onChange={e => handleFilterChange('date', e.target.value)}
                                />
                            </td>
                            <td className="px-2 py-2">
                                <input
                                    placeholder="Search..."
                                    className="w-full text-xs bg-slate-800/50 border border-white/5 rounded px-2 py-1 text-slate-300 placeholder:text-slate-600 focus:bg-slate-800 focus:border-violet-500/50 transition-all font-medium"
                                    value={filters.merchant}
                                    onChange={e => handleFilterChange('merchant', e.target.value)}
                                />
                            </td>
                            <td className="px-2 py-2">
                                <input
                                    placeholder="Filter..."
                                    className="w-full text-xs bg-slate-800/50 border border-white/5 rounded px-2 py-1 text-slate-300 placeholder:text-slate-600 focus:bg-slate-800 focus:border-violet-500/50 transition-all font-medium"
                                    value={filters.category}
                                    onChange={e => handleFilterChange('category', e.target.value)}
                                />
                            </td>
                            <td className="px-2 py-2">
                                <input
                                    placeholder="Search note..."
                                    className="w-full text-xs bg-slate-800/50 border border-white/5 rounded px-2 py-1 text-slate-300 placeholder:text-slate-600 focus:bg-slate-800 focus:border-violet-500/50 transition-all font-medium"
                                    value={filters.notes}
                                    onChange={e => handleFilterChange('notes', e.target.value)}
                                />
                            </td>
                            <td className="px-2 py-2">
                                <input
                                    placeholder="Amount..."
                                    className="w-full text-xs bg-slate-800/50 border border-white/5 rounded px-2 py-1 text-slate-300 placeholder:text-slate-600 focus:bg-slate-800 focus:border-violet-500/50 transition-all font-medium text-right"
                                    value={filters.amount}
                                    onChange={e => handleFilterChange('amount', e.target.value)}
                                />
                            </td>
                            <td className="px-2 py-2">
                                <input
                                    placeholder="Status..."
                                    className="w-full text-xs bg-slate-800/50 border border-white/5 rounded px-2 py-1 text-slate-300 placeholder:text-slate-600 focus:bg-slate-800 focus:border-violet-500/50 transition-all font-medium text-center"
                                    value={filters.status}
                                    onChange={e => handleFilterChange('status', e.target.value)}
                                />
                            </td>
                            {onDelete && <td className="px-2 py-2"></td>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {sortedTransactions.map((tx, i) => (
                            <TransactionRow
                                key={tx.id}
                                tx={tx}
                                categories={tx.type === 'income' ? incomeCategories : expenseCategories}
                                peerTransactions={transactions}
                                onUpdate={onRefresh}
                                onDelete={onDelete}
                                selected={selectedIds.has(tx.id)}
                                onSelect={handleSelectRow}
                                index={i}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TransactionRow({ tx, categories, peerTransactions, onUpdate, onDelete, selected, onSelect, index }: {
    tx: Transaction,
    categories: string[],
    peerTransactions?: Transaction[],
    onUpdate: (silent?: boolean) => void,
    onDelete?: (transactionId: string) => Promise<void>,
    selected?: boolean,
    onSelect?: (id: string, checked: boolean) => void,
    index?: number
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Edit State
    const [merchant, setMerchant] = useState(tx.merchant_normalized || tx.merchant_raw);
    const [category, setCategory] = useState(tx.category || '');
    const [notes, setNotes] = useState(tx.notes || '');

    // Classification State for Income
    const [classificationStep, setClassificationStep] = useState<'choose' | 'categorize'>('choose');
    const [incomeType, setIncomeType] = useState<'income' | 'reimbursement' | null>(null);
    const [displayCategories, setDisplayCategories] = useState(categories);
    const [expenseSuggestions, setExpenseSuggestions] = useState<any[]>([]);
    const [selectedExpenseLink, setSelectedExpenseLink] = useState<string | null>(null);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    const isIncoming = tx.type === 'income';
    const isSkippedOrPending = tx.status === 'skipped' || tx.status === 'pending';
    const suggestions = tx.ai_suggestions || [];
    const remainingCategories = displayCategories.filter(c => !suggestions.includes(c));

    const handleTypeSelection = async (type: 'income' | 'reimbursement') => {
        setIncomeType(type);
        setClassificationStep('categorize');

        // Fetch appropriate categories
        const { getCategoryNames } = await import('@/app/actions/review-transaction');
        if (type === 'income') {
            const cats = await getCategoryNames('income');
            setDisplayCategories(cats || []);
        } else {
            // Reimbursement = expense categories
            const cats = await getCategoryNames('expense');
            setDisplayCategories(cats || []);

            // Fetch expense suggestions
            setLoadingSuggestions(true);
            const suggestionResult = await suggestExpenseLinks(tx.date, tx.amount);
            if (suggestionResult.success && suggestionResult.suggestions) {
                setExpenseSuggestions(suggestionResult.suggestions);
            }
            setLoadingSuggestions(false);
        }
    };

    const [learnRule, setLearnRule] = useState(false);

    const handleSave = async () => {
        setLoading(true);

        // If reimbursement, we need to handle it as negative expense
        if (isIncoming && incomeType === 'reimbursement') {
            const reimbursementNote = notes || 'Reimbursement';
            // Pass learnRule to approveTransaction
            const res = await approveTransaction(tx.id, category, merchant, reimbursementNote, learnRule);

            if (res.success && selectedExpenseLink) {
                await linkReimbursementToExpense(tx.id, selectedExpenseLink);
            }

            setLoading(false);
            if (res.success) {
                setIsEditing(false);
                setClassificationStep('choose');
                setExpenseSuggestions([]);
                setSelectedExpenseLink(null);
                setLearnRule(false); // Reset
                onUpdate(true); // Silent update
            } else {
                alert('Error updating: ' + res.error);
            }
        } else {
            // Ask user if they want to learn this rule (if not already checked)
            let finalLearnRule = learnRule;
            if (!learnRule && category) {
                // Check peers
                const hasPeers = peerTransactions
                    ? peerTransactions.some(t =>
                        t.id !== tx.id &&
                        (t.status === 'pending' || t.status === 'skipped') &&
                        (
                            (t.merchant_raw === tx.merchant_raw) ||
                            (!!tx.merchant_normalized && t.merchant_normalized === tx.merchant_normalized)
                        )
                    )
                    : false;

                if (hasPeers && window.confirm(`🤖 Smart Learning Peers Found:\n\nShould "${merchant}" ALWAYS be categorized as "${category}"?\n\nOK = Yes, update all pending items.\nCancel = No, just this one.`)) {
                    finalLearnRule = true;
                }
            }

            // Pass learnRule to approveTransaction
            const res = await approveTransaction(tx.id, category, merchant, notes, finalLearnRule);
            setLoading(false);
            if (res.success) {
                setIsEditing(false);
                setClassificationStep('choose');
                setLearnRule(false); // Reset
                onUpdate(true); // Silent update
            } else {
                alert('Error updating: ' + res.error);
            }
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;

        const confirmed = window.confirm(
            `Delete transaction: ${tx.merchant_raw} - ${tx.amount} ${tx.currency}?\n\nThis action cannot be undone.`
        );

        if (confirmed) {
            setLoading(true);
            await onDelete(tx.id);
            setLoading(false);
        }
    };

    if (isEditing) {
        return (
            <tr className="bg-violet-900/10 border-l-2 border-l-violet-500 animate-in fade-in">
                <td className="px-6 py-4">
                    {/* Checkbox hidden/disabled during edit */}
                </td>
                <td colSpan={6} className="px-6 py-4">
                    <div className="space-y-3">
                        {/* Transaction Info */}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">{new Date(tx.date).toLocaleDateString('en-GB')}</span>
                            <span className={`font-bold tabular-nums ${tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>
                                {tx.amount} {tx.currency}
                            </span>
                        </div>

                        {/* Wrapper for fields */}

                        {/* Classification Step for Incoming Transactions */}
                        {isIncoming && classificationStep === 'choose' && (
                            <div className="bg-slate-900/50 border border-indigo-500/30 rounded-lg p-4">
                                <p className="text-sm font-medium text-indigo-300 mb-3">💰 Is this received money:</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleTypeSelection('income')}
                                        className="flex-1 px-4 py-3 bg-slate-800 hover:bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 font-medium rounded-lg transition-all text-sm"
                                    >
                                        <div>💵 Income</div>
                                        <div className="text-xs font-normal text-emerald-500/70">Salary, gift, etc.</div>
                                    </button>
                                    <button
                                        onClick={() => handleTypeSelection('reimbursement')}
                                        className="flex-1 px-4 py-3 bg-slate-800 hover:bg-orange-900/20 border border-orange-500/30 text-orange-400 font-medium rounded-lg transition-all text-sm"
                                    >
                                        <div>🔄 Reimbursement</div>
                                        <div className="text-xs font-normal text-orange-500/70">Payback for shared expense</div>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Expense Suggestions for Reimbursement */}
                        {isIncoming && incomeType === 'reimbursement' && classificationStep === 'categorize' && expenseSuggestions.length > 0 && (
                            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 mb-3">
                                <p className="text-sm font-medium text-purple-300 mb-2">🔍 Found recent expenses that might be related:</p>
                                <div className="space-y-2">
                                    {expenseSuggestions.map((suggestion, idx) => (
                                        <button
                                            key={suggestion.transaction.id}
                                            onClick={() => {
                                                setCategory(suggestion.transaction.category || '');
                                                setSelectedExpenseLink(suggestion.transaction.id);
                                            }}
                                            className={`w-full text-left p-3 rounded-lg border transition-all ${selectedExpenseLink === suggestion.transaction.id
                                                ? 'border-purple-500 bg-purple-500/20'
                                                : 'border-purple-500/10 bg-slate-900/50 hover:border-purple-500/30 hover:bg-purple-500/10'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium text-slate-200">
                                                        {suggestion.transaction.merchant_normalized || suggestion.transaction.merchant_raw}
                                                    </div>
                                                    <div className="text-xs text-slate-400 mt-0.5">
                                                        {suggestion.transaction.category} • {suggestion.daysAgo} days ago
                                                        {suggestion.amountMatch === 'exact' && ' • Exact match ✓'}
                                                    </div>
                                                </div>
                                                <div className="text-sm font-bold text-slate-200 tabular-nums">
                                                    ₪{suggestion.transaction.amount}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setSelectedExpenseLink(null)}
                                    className="mt-2 text-xs text-purple-400 hover:text-purple-300"
                                >
                                    ✕ None of these – manual category
                                </button>
                            </div>
                        )}

                        {/* Edit Fields */}
                        {(!isIncoming || classificationStep === 'categorize') && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Merchant */}
                                <input
                                    className="input-base"
                                    value={merchant}
                                    onChange={e => setMerchant(e.target.value)}
                                    placeholder="Merchant Name"
                                    autoFocus={!isIncoming || classificationStep === 'categorize'}
                                />

                                {/* Notes */}
                                <input
                                    className="input-base"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder={incomeType === 'reimbursement' ? "Context (e.g., Pizza split)" : "Add details..."}
                                />

                                {/* Category */}
                                <select
                                    className="input-base"
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    <option value="" className="text-slate-900">Select...</option>
                                    {suggestions.length > 0 && <optgroup label="✨ AI Suggestions" className="text-slate-900">
                                        {suggestions.map(s => <option key={s} value={s} className="text-slate-900">✨ {s}</option>)}
                                    </optgroup>}
                                    <optgroup label="Categories" className="text-slate-900">
                                        {remainingCategories.map(c => <option key={c} value={c} className="text-slate-900">{c}</option>)}
                                    </optgroup>
                                </select>
                            </div>
                        )}

                        {/* Actions */}
                        {(!isIncoming || classificationStep === 'categorize') && (
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setClassificationStep('choose');
                                    }}
                                    className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={loading || !category}
                                    className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg shadow-lg hover:shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        )}

                        {/* Learn Rule Checkbox */}
                        {(!isIncoming || classificationStep === 'categorize') && (
                            <div className="flex items-center gap-2 mt-2 pl-1">
                                <input
                                    type="checkbox"
                                    id={`learn-${tx.id}`}
                                    className="rounded border-slate-600 bg-slate-800 text-violet-600 focus:ring-violet-500"
                                    checked={learnRule}
                                    onChange={e => setLearnRule(e.target.checked)}
                                />
                                <label htmlFor={`learn-${tx.id}`} className="text-xs text-slate-400 select-none cursor-pointer">
                                    Always categorize <strong>{merchant}</strong> as <strong>{category || 'this'}</strong>?
                                </label>
                            </div>
                        )}
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr
            style={{ animationDelay: `${(index || 0) * 15}ms` }}
            className={`
                group transition-all duration-200 border-b border-white/5 last:border-0 hover:bg-white/[0.02] animate-in fade-in slide-in-from-bottom-2
                ${isSkippedOrPending ? 'bg-amber-900/[0.05]' : ''} 
                ${selected ? 'bg-violet-500/[0.08] hover:bg-violet-500/[0.12]' : ''}
            `}
        >
            <td className="px-6 py-4 whitespace-nowrap">
                <input
                    type="checkbox"
                    className="rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 cursor-pointer transition-colors"
                    checked={selected || false}
                    onChange={e => onSelect && onSelect(tx.id, e.target.checked)}
                />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                {new Date(tx.date).toLocaleDateString('en-GB')}
            </td>
            <td
                className="px-6 py-4 whitespace-nowrap text-sm text-slate-200 cursor-pointer group-hover:text-white transition-colors"
                onClick={() => setIsEditing(true)}
                title="Click to Edit"
            >
                <div className="flex items-center gap-2">
                    {tx.merchant_normalized || tx.merchant_raw}
                    <span className="opacity-0 group-hover:opacity-100 text-slate-500 text-xs transition-opacity">✎</span>
                </div>
            </td>
            {/* ... rest of columns */}
            <td
                className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 cursor-pointer"
                onClick={() => setIsEditing(true)}
            >
                {tx.category ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 group-hover:border-violet-500/30 group-hover:text-violet-300 transition-colors">
                        {tx.category}
                    </span>
                ) : (
                    <span className="text-amber-500/80 italic text-xs flex items-center gap-1">
                        Select Category...
                    </span>
                )}
            </td>
            <td
                className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 cursor-pointer max-w-[150px] truncate"
                onClick={() => setIsEditing(true)}
                title={tx.notes || ''}
            >
                {tx.notes ? (
                    <span className="text-slate-400">{tx.notes}</span>
                ) : (
                    <span className="opacity-0 group-hover:opacity-30 hover:!opacity-100 transition-opacity text-slate-500 text-xs italic">+ Add note</span>
                )}
            </td>
            <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium tabular-nums ${tx.type === 'income' ? 'text-emerald-400' : 'text-slate-200'}`}>
                {tx.amount} {tx.currency}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                {isSkippedOrPending ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Review
                    </span>
                ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Verified
                    </span>
                )}
            </td>
            {onDelete && (
                <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-rose-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-lg transition-all disabled:opacity-50"
                        title="Delete transaction"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </td>
            )}
        </tr>
    );
}
