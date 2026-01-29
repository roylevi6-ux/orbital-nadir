'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
    runP2PReconciliation,
    mergeP2PMatch,
    mergeWithdrawal,
    markAsBalancePaid,
    applyReimbursement,
    findRelatedExpenses,
    searchTransactionsForReimbursement,
    ReconciliationResult,
    TransactionSummary
} from '@/app/actions/p2p-reconciliation';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

type Phase = 'matches' | 'withdrawals' | 'balance_paid' | 'reimbursements';

interface ReimbursementState {
    selectedCategory: string;
    linkedExpenseId?: string;
    relatedExpenses: TransactionSummary[];
    searchResults: TransactionSummary[];
    searchQuery: string;
    isSearching: boolean;
    notes: string;
}

interface BalancePaidState {
    selectedCategory: string;
    notes: string;
}

export default function ReconciliationResolver({ isOpen, onClose, onComplete }: Props) {
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<string[]>([]);
    const [reconciliationData, setReconciliationData] = useState<ReconciliationResult | null>(null);
    const [currentPhase, setCurrentPhase] = useState<Phase>('matches');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [resolving, setResolving] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [customNotes, setCustomNotes] = useState<string>('');

    // For matches phase - which app candidate is selected + category
    const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
    const [matchCategory, setMatchCategory] = useState<string>('');

    // For withdrawals phase - which bank candidate is selected
    const [selectedBankCandidateId, setSelectedBankCandidateId] = useState<string | null>(null);

    // For reimbursements phase
    const [reimbursementState, setReimbursementState] = useState<ReimbursementState>({
        selectedCategory: '',
        relatedExpenses: [],
        searchResults: [],
        searchQuery: '',
        isSearching: false,
        notes: ''
    });

    // For balance-paid phase
    const [balancePaidState, setBalancePaidState] = useState<BalancePaidState>({
        selectedCategory: '',
        notes: ''
    });

    useEffect(() => {
        setMounted(true);
        if (isOpen) {
            loadReconciliationData();
            loadCategories();
        } else {
            resetState();
        }
    }, [isOpen]);

    // Reset state when moving to new item or phase
    useEffect(() => {
        setCustomNotes('');
        setSelectedCandidateId(null);

        // For matches, auto-select first candidate
        if (currentPhase === 'matches' && reconciliationData?.matches[currentIndex]) {
            const match = reconciliationData.matches[currentIndex];
            if (match.appCandidates.length === 1) {
                setSelectedCandidateId(match.appCandidates[0].id);
            }
        }

        // For reimbursements, load related expenses
        if (currentPhase === 'reimbursements' && reconciliationData?.reimbursements[currentIndex]) {
            loadRelatedExpenses(reconciliationData.reimbursements[currentIndex]);
        }
    }, [currentIndex, currentPhase, reconciliationData]);

    const resetState = () => {
        setReconciliationData(null);
        setCurrentPhase('matches');
        setCurrentIndex(0);
        setCustomNotes('');
        setSelectedCandidateId(null);
        setMatchCategory('');
        setSelectedBankCandidateId(null);
        setReimbursementState({ selectedCategory: '', relatedExpenses: [], searchResults: [], searchQuery: '', isSearching: false, notes: '' });
        setBalancePaidState({ selectedCategory: '', notes: '' });
    };

    const loadCategories = async () => {
        try {
            const { getCategoryNames } = await import('@/app/actions/review-transaction');
            const cats = await getCategoryNames('expense');
            setCategories(cats || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadReconciliationData = async () => {
        setLoading(true);
        try {
            const data = await runP2PReconciliation();
            setReconciliationData(data);

            // Determine starting phase
            if (data.matches.length > 0) {
                setCurrentPhase('matches');
            } else if (data.withdrawals.length > 0) {
                setCurrentPhase('withdrawals');
            } else if (data.balancePaid.length > 0) {
                setCurrentPhase('balance_paid');
            } else if (data.reimbursements.length > 0) {
                setCurrentPhase('reimbursements');
            } else {
                toast.success('No payments need reconciliation! 🎉');
                onClose();
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load reconciliation data');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const loadRelatedExpenses = async (transaction: TransactionSummary) => {
        try {
            const related = await findRelatedExpenses(transaction.id);
            setReimbursementState(prev => ({
                ...prev,
                relatedExpenses: related,
                linkedExpenseId: related[0]?.id // Auto-select first suggestion
            }));
        } catch (e) {
            console.error(e);
        }
    };

    const handleSearchTransactions = async (query: string) => {
        setReimbursementState(prev => ({ ...prev, searchQuery: query }));

        if (!query || query.trim().length < 2 || !reconciliationData?.reimbursements[currentIndex]) {
            setReimbursementState(prev => ({ ...prev, searchResults: [], isSearching: false }));
            return;
        }

        setReimbursementState(prev => ({ ...prev, isSearching: true }));
        try {
            const results = await searchTransactionsForReimbursement(
                query,
                reconciliationData.reimbursements[currentIndex].id
            );
            setReimbursementState(prev => ({
                ...prev,
                searchResults: results,
                isSearching: false
            }));
        } catch (e) {
            console.error(e);
            setReimbursementState(prev => ({ ...prev, isSearching: false }));
        }
    };

    const getCurrentItems = () => {
        if (!reconciliationData) return [];
        switch (currentPhase) {
            case 'matches': return reconciliationData.matches;
            case 'withdrawals': return reconciliationData.withdrawals;
            case 'balance_paid': return reconciliationData.balancePaid;
            case 'reimbursements': return reconciliationData.reimbursements;
        }
    };

    const getTotalCount = () => {
        if (!reconciliationData) return 0;
        return reconciliationData.matches.length +
               reconciliationData.withdrawals.length +
               reconciliationData.balancePaid.length +
               reconciliationData.reimbursements.length;
    };

    const getGlobalIndex = () => {
        if (!reconciliationData) return 0;
        switch (currentPhase) {
            case 'matches': return currentIndex + 1;
            case 'withdrawals': return reconciliationData.matches.length + currentIndex + 1;
            case 'balance_paid': return reconciliationData.matches.length + reconciliationData.withdrawals.length + currentIndex + 1;
            case 'reimbursements': return reconciliationData.matches.length + reconciliationData.withdrawals.length + reconciliationData.balancePaid.length + currentIndex + 1;
            default: return currentIndex + 1;
        }
    };

    const moveToNext = () => {
        const items = getCurrentItems();
        // Reset state for next item
        setMatchCategory('');
        setSelectedCandidateId(null);
        setSelectedBankCandidateId(null);
        setCustomNotes('');
        setBalancePaidState({ selectedCategory: '', notes: '' });
        setReimbursementState({ selectedCategory: '', relatedExpenses: [], searchResults: [], searchQuery: '', isSearching: false, notes: '' });

        if (currentIndex < items.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // Move to next phase
            if (currentPhase === 'matches' && reconciliationData?.withdrawals.length) {
                setCurrentPhase('withdrawals');
                setCurrentIndex(0);
            } else if ((currentPhase === 'matches' || currentPhase === 'withdrawals') && reconciliationData?.balancePaid.length) {
                setCurrentPhase('balance_paid');
                setCurrentIndex(0);
            } else if ((currentPhase === 'matches' || currentPhase === 'withdrawals' || currentPhase === 'balance_paid') && reconciliationData?.reimbursements.length) {
                setCurrentPhase('reimbursements');
                setCurrentIndex(0);
            } else {
                // All done!
                toast.success('All payments reconciled!');
                onComplete();
                onClose();
            }
        }
    };

    const handleMergeMatch = async () => {
        if (!reconciliationData || !selectedCandidateId) return;
        if (!matchCategory) {
            toast.error('Please select a category');
            return;
        }

        const match = reconciliationData.matches[currentIndex];
        const ccTx = match.ccTransaction;

        setResolving(true);
        try {
            await mergeP2PMatch(ccTx.id, selectedCandidateId, {
                category: matchCategory,
                notes: customNotes || undefined
            });
            toast.success('Transactions merged');
            moveToNext();
        } catch (error) {
            toast.error('Failed to merge transactions');
        } finally {
            setResolving(false);
        }
    };

    const handleMergeWithdrawal = async () => {
        if (!reconciliationData || !selectedBankCandidateId) return;

        const withdrawal = reconciliationData.withdrawals[currentIndex];
        const withdrawalTx = withdrawal.appWithdrawal;

        setResolving(true);
        try {
            await mergeWithdrawal(withdrawalTx.id, selectedBankCandidateId);
            toast.success('Transfer matched - both entries eliminated');
            moveToNext();
        } catch (error) {
            toast.error('Failed to match transfer');
        } finally {
            setResolving(false);
        }
    };

    const handleApplyReimbursement = async () => {
        if (!reconciliationData || !reimbursementState.selectedCategory) {
            toast.error('Please select a category');
            return;
        }

        const tx = reconciliationData.reimbursements[currentIndex];

        setResolving(true);
        try {
            await applyReimbursement(
                tx.id,
                reimbursementState.selectedCategory,
                reimbursementState.linkedExpenseId,
                reimbursementState.notes || undefined
            );
            toast.success('Reimbursement applied');
            moveToNext();
        } catch (error) {
            toast.error('Failed to apply reimbursement');
        } finally {
            setResolving(false);
        }
    };

    const handleSkip = () => {
        moveToNext();
    };

    const handleConfirmBalancePaid = async () => {
        if (!reconciliationData || !balancePaidState.selectedCategory) {
            toast.error('Please select a category');
            return;
        }

        const tx = reconciliationData.balancePaid[currentIndex];

        setResolving(true);
        try {
            await markAsBalancePaid(tx.id, balancePaidState.selectedCategory, balancePaidState.notes || undefined);
            toast.success('Expense categorized');
            moveToNext();
        } catch (error) {
            toast.error('Failed to save expense');
        } finally {
            setResolving(false);
        }
    };

    if (!mounted || !isOpen) return null;

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('he-IL', {
            day: '2-digit',
            month: '2-digit'
        });
    };

    const formatAmount = (amount: number, currency: string = 'ILS') => {
        const symbol = currency === 'ILS' ? '₪' : currency;
        return `${symbol}${Math.abs(amount).toFixed(0)}`;
    };

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
                        <p>Analyzing payments for reconciliation...</p>
                    </div>
                </div>
            )}

            {!loading && reconciliationData && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span>🔄</span> Reconcile Payments
                                </h3>
                                <p className="text-slate-400 text-sm mt-1">
                                    Item {getGlobalIndex()} of {getTotalCount()}
                                </p>
                            </div>
                            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6 overflow-y-auto">

                            {/* Phase 1: Matches */}
                            {currentPhase === 'matches' && reconciliationData.matches[currentIndex] && (
                                <>
                                    <div className="text-center mb-4">
                                        <span className="px-3 py-1 bg-violet-500/20 text-violet-300 text-xs font-medium rounded-full">
                                            Match App Payment to Credit Card
                                        </span>
                                    </div>

                                    {/* CC Transaction (Left side) */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Credit Card Entry</label>
                                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-white">
                                                        {reconciliationData.matches[currentIndex].ccTransaction.merchant_raw}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {formatDate(reconciliationData.matches[currentIndex].ccTransaction.date)}
                                                    </p>
                                                </div>
                                                <p className="font-mono font-bold text-white">
                                                    {formatAmount(reconciliationData.matches[currentIndex].ccTransaction.amount)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* App Candidates */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">
                                            App Screenshots ({reconciliationData.matches[currentIndex].appCandidates.length} match{reconciliationData.matches[currentIndex].appCandidates.length > 1 ? 'es' : ''})
                                        </label>
                                        <div className="space-y-2">
                                            {reconciliationData.matches[currentIndex].appCandidates.map((candidate) => (
                                                <button
                                                    key={candidate.id}
                                                    onClick={() => setSelectedCandidateId(candidate.id)}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                                                        selectedCandidateId === candidate.id
                                                            ? 'bg-emerald-500/20 border-emerald-500/50'
                                                            : 'bg-slate-950/50 border-white/5 hover:bg-slate-800/50'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="font-medium text-white">
                                                                {candidate.p2p_counterparty || candidate.merchant_raw}
                                                            </p>
                                                            <p className="text-xs text-slate-400">
                                                                {formatDate(candidate.date)}
                                                                {candidate.p2p_memo && (
                                                                    <span className="ml-2 text-slate-500">
                                                                        &ldquo;{candidate.p2p_memo}&rdquo;
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <p className="font-mono font-bold text-white">
                                                                {formatAmount(candidate.amount)}
                                                            </p>
                                                            {selectedCandidateId === candidate.id && (
                                                                <span className="text-emerald-400">✓</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Category selection */}
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                            Expense Category
                                        </label>
                                        <select
                                            value={matchCategory}
                                            onChange={(e) => setMatchCategory(e.target.value)}
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                        >
                                            <option value="">Select category...</option>
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Notes */}
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Notes (Optional)</label>
                                        <textarea
                                            value={customNotes}
                                            onChange={(e) => setCustomNotes(e.target.value)}
                                            placeholder="Add notes for the merged transaction..."
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Phase 2: Withdrawals - BIT→Bank transfers */}
                            {currentPhase === 'withdrawals' && reconciliationData.withdrawals[currentIndex] && (
                                <>
                                    <div className="text-center mb-4">
                                        <span className="px-3 py-1 bg-orange-500/20 text-orange-300 text-xs font-medium rounded-full">
                                            Bank Transfer (Internal)
                                        </span>
                                    </div>

                                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 mb-4">
                                        <p className="text-sm text-orange-200">
                                            This is a withdrawal from your BIT/Paybox balance to your bank account.
                                            Match it to the corresponding bank deposit to eliminate both entries.
                                        </p>
                                    </div>

                                    {/* BIT Withdrawal */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">BIT Withdrawal</label>
                                        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-white">
                                                        🏦 {reconciliationData.withdrawals[currentIndex].appWithdrawal.p2p_counterparty || reconciliationData.withdrawals[currentIndex].appWithdrawal.merchant_raw}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {formatDate(reconciliationData.withdrawals[currentIndex].appWithdrawal.date)}
                                                    </p>
                                                </div>
                                                <p className="font-mono font-bold text-white">
                                                    {formatAmount(reconciliationData.withdrawals[currentIndex].appWithdrawal.amount)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bank Candidates */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">
                                            Bank Statement Deposits ({reconciliationData.withdrawals[currentIndex].bankCandidates.length} match{reconciliationData.withdrawals[currentIndex].bankCandidates.length !== 1 ? 'es' : ''})
                                        </label>
                                        <div className="space-y-2">
                                            {reconciliationData.withdrawals[currentIndex].bankCandidates.map((candidate) => (
                                                <button
                                                    key={candidate.id}
                                                    onClick={() => setSelectedBankCandidateId(candidate.id)}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                                                        selectedBankCandidateId === candidate.id
                                                            ? 'bg-emerald-500/20 border-emerald-500/50'
                                                            : 'bg-slate-950/50 border-white/5 hover:bg-slate-800/50'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="font-medium text-white">
                                                                {candidate.merchant_raw}
                                                            </p>
                                                            <p className="text-xs text-slate-400">
                                                                {formatDate(candidate.date)}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <p className="font-mono font-bold text-emerald-400">
                                                                +{formatAmount(candidate.amount)}
                                                            </p>
                                                            {selectedBankCandidateId === candidate.id && (
                                                                <span className="text-emerald-400">✓</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Phase 3: Balance Paid - one at a time with category */}
                            {currentPhase === 'balance_paid' && reconciliationData.balancePaid[currentIndex] && (
                                <>
                                    <div className="text-center mb-4">
                                        <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-medium rounded-full">
                                            Wallet Balance Payment
                                        </span>
                                    </div>

                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 mb-4">
                                        <p className="text-sm text-blue-200">
                                            This payment was made from your BIT/Paybox wallet balance (not credit card).
                                            Select a category to classify this expense.
                                        </p>
                                    </div>

                                    {/* Transaction details */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Wallet Payment</label>
                                        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-white">
                                                        💳 {reconciliationData.balancePaid[currentIndex].p2p_counterparty || reconciliationData.balancePaid[currentIndex].merchant_raw}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {formatDate(reconciliationData.balancePaid[currentIndex].date)}
                                                        {reconciliationData.balancePaid[currentIndex].p2p_memo && (
                                                            <span className="ml-2">
                                                                &quot;{reconciliationData.balancePaid[currentIndex].p2p_memo}&quot;
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <p className="font-mono font-bold text-white">
                                                    {formatAmount(reconciliationData.balancePaid[currentIndex].amount)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Category selection */}
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                            Expense Category
                                        </label>
                                        <select
                                            value={balancePaidState.selectedCategory}
                                            onChange={(e) => setBalancePaidState(prev => ({ ...prev, selectedCategory: e.target.value }))}
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                        >
                                            <option value="">Select category...</option>
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Notes */}
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Notes (Optional)</label>
                                        <textarea
                                            value={balancePaidState.notes}
                                            onChange={(e) => setBalancePaidState(prev => ({ ...prev, notes: e.target.value }))}
                                            placeholder="Add notes for this expense..."
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Phase 3: Reimbursements */}
                            {currentPhase === 'reimbursements' && reconciliationData.reimbursements[currentIndex] && (
                                <>
                                    <div className="text-center mb-4">
                                        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-medium rounded-full">
                                            Classify Reimbursement
                                        </span>
                                    </div>

                                    {/* Incoming transaction */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Received Payment</label>
                                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-white">
                                                        💰 Received from {reconciliationData.reimbursements[currentIndex].p2p_counterparty || 'Unknown'}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {formatDate(reconciliationData.reimbursements[currentIndex].date)}
                                                        {reconciliationData.reimbursements[currentIndex].p2p_memo && (
                                                            <span className="ml-2">
                                                                &quot;{reconciliationData.reimbursements[currentIndex].p2p_memo}&quot;
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <p className="font-mono font-bold text-emerald-400">
                                                    +{formatAmount(reconciliationData.reimbursements[currentIndex].amount)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Related expense suggestion */}
                                    {reimbursementState.relatedExpenses.length > 0 && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase">
                                                🔍 Found possible related expense
                                            </label>
                                            {reimbursementState.relatedExpenses.map((expense) => (
                                                <button
                                                    key={expense.id}
                                                    onClick={() => setReimbursementState(prev => ({
                                                        ...prev,
                                                        linkedExpenseId: expense.id,
                                                        selectedCategory: expense.category || prev.selectedCategory
                                                    }))}
                                                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                                                        reimbursementState.linkedExpenseId === expense.id
                                                            ? 'bg-violet-500/20 border-violet-500/50'
                                                            : 'bg-slate-950/50 border-white/5 hover:bg-slate-800/50'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="text-sm text-white">{expense.merchant_raw}</p>
                                                            <p className="text-xs text-slate-400">
                                                                {formatDate(expense.date)} • {expense.category || 'Uncategorized'}
                                                            </p>
                                                        </div>
                                                        <p className="font-mono text-rose-400">
                                                            -{formatAmount(expense.amount)}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Search for transaction */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">
                                            🔎 Search for transaction to link
                                        </label>
                                        <input
                                            type="text"
                                            value={reimbursementState.searchQuery}
                                            onChange={(e) => handleSearchTransactions(e.target.value)}
                                            placeholder="Search by merchant name, category..."
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                        />
                                        {reimbursementState.isSearching && (
                                            <p className="text-xs text-slate-400">Searching...</p>
                                        )}
                                        {reimbursementState.searchResults.length > 0 && (
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {reimbursementState.searchResults.map((expense) => (
                                                    <button
                                                        key={expense.id}
                                                        onClick={() => setReimbursementState(prev => ({
                                                            ...prev,
                                                            linkedExpenseId: expense.id,
                                                            selectedCategory: expense.category || prev.selectedCategory,
                                                            searchQuery: '',
                                                            searchResults: []
                                                        }))}
                                                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                                                            reimbursementState.linkedExpenseId === expense.id
                                                                ? 'bg-cyan-500/20 border-cyan-500/50'
                                                                : 'bg-slate-950/50 border-white/5 hover:bg-slate-800/50'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="text-sm text-white">{expense.merchant_raw}</p>
                                                                <p className="text-xs text-slate-400">
                                                                    {formatDate(expense.date)} • {expense.category || 'Uncategorized'}
                                                                </p>
                                                            </div>
                                                            <p className="font-mono text-rose-400">
                                                                -{formatAmount(expense.amount)}
                                                            </p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {reimbursementState.searchQuery.length >= 2 && !reimbursementState.isSearching && reimbursementState.searchResults.length === 0 && (
                                            <p className="text-xs text-slate-400">No transactions found</p>
                                        )}
                                    </div>

                                    {/* Category selection */}
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                            Which expense category to offset?
                                        </label>
                                        <select
                                            value={reimbursementState.selectedCategory}
                                            onChange={(e) => setReimbursementState(prev => ({
                                                ...prev,
                                                selectedCategory: e.target.value
                                            }))}
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                        >
                                            <option value="">Select category...</option>
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Notes */}
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Notes (Optional)</label>
                                        <textarea
                                            value={reimbursementState.notes}
                                            onChange={(e) => setReimbursementState(prev => ({ ...prev, notes: e.target.value }))}
                                            placeholder="Add notes for this reimbursement..."
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                                            rows={2}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer Controls */}
                        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
                            <button
                                onClick={handleSkip}
                                className="px-4 py-2 text-slate-400 hover:text-white font-medium transition-colors"
                            >
                                Skip
                            </button>

                            {currentPhase === 'matches' && (
                                <button
                                    onClick={handleMergeMatch}
                                    disabled={resolving || !selectedCandidateId || !matchCategory}
                                    className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {resolving ? 'Merging...' : 'Confirm Match'}
                                </button>
                            )}

                            {currentPhase === 'withdrawals' && (
                                <button
                                    onClick={handleMergeWithdrawal}
                                    disabled={resolving || !selectedBankCandidateId}
                                    className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-orange-500/20 disabled:opacity-50"
                                >
                                    {resolving ? 'Matching...' : 'Confirm Transfer'}
                                </button>
                            )}

                            {currentPhase === 'balance_paid' && (
                                <button
                                    onClick={handleConfirmBalancePaid}
                                    disabled={resolving || !balancePaidState.selectedCategory}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
                                >
                                    {resolving ? 'Saving...' : 'Confirm Category'}
                                </button>
                            )}

                            {currentPhase === 'reimbursements' && (
                                <button
                                    onClick={handleApplyReimbursement}
                                    disabled={resolving || !reimbursementState.selectedCategory}
                                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50"
                                >
                                    {resolving ? 'Applying...' : 'Apply Reimbursement'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
