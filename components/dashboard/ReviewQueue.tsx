'use client';

import { useState, useEffect } from 'react';
import { SkippedTransaction, getSkippedTransactions, approveTransaction, getCategoryNames, retrySkippedTransactions } from '@/app/actions/review-transaction';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, Wallet, Banknote, ArrowLeftRight } from 'lucide-react';

export default function ReviewQueue() {
    const [transactions, setTransactions] = useState<SkippedTransaction[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);

    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);
    const router = useRouter();

    // Fetch data on mount
    useEffect(() => {
        const loadData = async () => {
            const [txRes, expRes, incRes] = await Promise.all([
                getSkippedTransactions(),
                getCategoryNames('expense'),
                getCategoryNames('income')
            ]);

            if (txRes.success) setTransactions(txRes.data);
            if (expRes) setExpenseCategories(expRes);
            if (incRes) setIncomeCategories(incRes);
            setLoading(false);
        };
        loadData();
    }, []);

    const handleApprove = async (tx: SkippedTransaction, category: string, merchantName: string, notes?: string, learnRule = false) => {
        setProcessingId(tx.id);

        // Optimistic update? No, safer to wait for server success for bulk ops.
        const res = await approveTransaction(tx.id, category, merchantName, notes, learnRule);

        if (res.success) {
            // Remove the main transaction and any bulk-updated peers from local list
            setTransactions(prev => {
                const idsToRemove = new Set(res.updatedIds || []);
                idsToRemove.add(tx.id);
                return prev.filter(t => !idsToRemove.has(t.id));
            });
            router.refresh();
        } else {
            toast.error('Failed to update: ' + res.error);
        }
        setProcessingId(null);
    };

    const handleRetryAI = async () => {
        setIsRetrying(true);
        const res = await retrySkippedTransactions();
        if (res.success) {
            setTransactions([]); // Clear list
            router.refresh();
            window.location.reload(); // Hard refresh to trigger main auto-categorize if needed (or user clicks it)
        } else {
            toast.error('Failed to reset: ' + res.error);
        }
        setIsRetrying(false);
    };

    if (loading) return null;
    if (transactions.length === 0) return null;

    return (
        <div className="card overflow-hidden mb-8 border border-white/10 shadow-lg shadow-black/20">
            <div className="p-4 bg-amber-500/10 border-b border-white/10 flex justify-between items-center backdrop-blur-md">
                <div className="flex items-center gap-4 text-amber-200">
                    <div className="bg-amber-500/20 p-2 rounded-xl border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)] flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-amber-400" /></div>
                    <div>
                        <h3 className="font-bold text-sm uppercase tracking-wide text-amber-500/80 mb-0.5">Review Queue</h3>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-amber-400 tabular-nums leading-none tracking-tight">
                                {transactions.length}
                            </span>
                            <span className="text-sm font-medium text-amber-500/60">pending</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRetryAI}
                        disabled={isRetrying}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium hover:underline disabled:opacity-50 transition-colors"
                    >
                        {isRetrying ? 'Resetting...' : <><RefreshCw className="w-3 h-3 inline mr-1" /> Retry AI Analysis</>}
                    </button>
                    <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-full uppercase border border-amber-500/30">
                        Teaching Mode
                    </span>
                </div>
            </div>

            <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto bg-slate-900/30">
                {transactions.map(tx => (
                    <ReviewItem
                        key={tx.id}
                        transaction={tx}
                        categories={tx.type === 'income' ? incomeCategories : expenseCategories}
                        parentTransactions={transactions}
                        onApprove={handleApprove}
                        isProcessing={processingId === tx.id}
                    />
                ))}
            </div>
        </div>
    );
}

function ReviewItem({
    transaction,
    categories,
    parentTransactions,
    onApprove,
    isProcessing
}: {
    transaction: SkippedTransaction,
    categories: string[],
    parentTransactions?: SkippedTransaction[], // Optional full list for context check
    onApprove: (tx: SkippedTransaction, cat: string, merch: string, notes?: string, learnRule?: boolean) => void,
    isProcessing: boolean
}) {
    const [merchantName, setMerchantName] = useState(transaction.merchant_raw);
    const [selectedCategory, setSelectedCategory] = useState(transaction.category || '');
    const [notes, setNotes] = useState('');

    // New state for income classification
    const [classificationStep, setClassificationStep] = useState<'choose' | 'categorize'>('choose');
    const [incomeType, setIncomeType] = useState<'income' | 'reimbursement' | null>(null);
    const [displayCategories, setDisplayCategories] = useState(categories);

    // Pre-fill merchant name clean-up
    useEffect(() => {
        let clean = transaction.merchant_raw;
        if (clean.toLowerCase().includes('bit transfer')) clean = clean.replace(/bit transfer/i, '').trim();
        if (clean.startsWith('BIT ')) clean = clean.substring(4);
        setMerchantName(clean);
    }, [transaction.merchant_raw]);

    // Check if this is an incoming transaction that needs classification
    const isIncoming = transaction.type === 'income';

    const suggestions = transaction.ai_suggestions || [];
    if (transaction.category && !suggestions.includes(transaction.category)) {
        suggestions.unshift(transaction.category);
    }
    const remainingCategories = displayCategories.filter(c => !suggestions.includes(c));

    const handleTypeSelection = async (type: 'income' | 'reimbursement') => {
        setIncomeType(type);
        setClassificationStep('categorize');

        // Fetch appropriate categories
        if (type === 'income') {
            const { getCategoryNames } = await import('@/app/actions/review-transaction');
            const cats = await getCategoryNames('income');
            setDisplayCategories(cats || []);
        } else {
            // Reimbursement = expense categories
            const { getCategoryNames } = await import('@/app/actions/review-transaction');
            const cats = await getCategoryNames('expense');
            setDisplayCategories(cats || []);
        }
    };

    const [learnRule, setLearnRule] = useState(false);

    const handleApprove = () => {
        if (isIncoming && incomeType === 'reimbursement') {
            // Create a modified transaction with negative amount
            const modifiedTx = {
                ...transaction,
                type: 'expense' as const,
                amount: -Math.abs(transaction.amount)
            };
            onApprove(modifiedTx, selectedCategory, merchantName, notes || 'Reimbursement', learnRule);
        } else {
            // Ask user if they want to learn this rule (if not already checked)
            let finalLearnRule = learnRule;
            if (!learnRule && selectedCategory) {
                // Check if there are other pending transactions for this merchant
                const hasPeers = parentTransactions
                    ? parentTransactions.some(t =>
                        t.id !== transaction.id &&
                        (
                            t.merchant_raw === transaction.merchant_raw ||
                            (!!transaction.merchant_normalized && t.merchant_normalized === transaction.merchant_normalized)
                        )
                    )
                    : false;

                if (hasPeers && window.confirm(`🤖 Smart Learning Detected Peers:\n\nWe found other "${merchantName}" transactions waiting.\n\nShould we ALWAYS categorize them as "${selectedCategory}"?\n\nOK = Yes, update all.\nCancel = No, just this one.`)) {
                    finalLearnRule = true;
                }
            }
            onApprove(transaction, selectedCategory, merchantName, notes, finalLearnRule);
        }
    };

    return (
        <div className="p-4 hover:bg-white/5 transition-colors group">
            <div className="flex flex-col gap-3">

                {/* Top Row: Info */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted mb-1">
                            <span className="font-medium bg-white/10 px-1.5 py-0.5 rounded">{new Date(transaction.date).toLocaleDateString('en-GB')}</span>
                            <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${transaction.type === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {transaction.type}
                            </span>
                        </div>
                        <div className="font-semibold text-main truncate text-base group-hover:text-white transition-colors" title={transaction.merchant_raw}>
                            {transaction.merchant_raw}
                            <span className="text-muted font-normal text-xs ml-2">{transaction.amount} {transaction.currency}</span>
                        </div>
                    </div>
                </div>

                {/* Classification Step for Incoming Transactions */}
                {isIncoming && classificationStep === 'choose' && (
                    <div className="bg-violet-900/20 border border-violet-500/20 rounded-lg p-4 backdrop-blur-sm">
                        <p className="text-sm font-medium text-violet-200 mb-3 flex items-center gap-2"><Wallet className="w-4 h-4" /> Is this received money:</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleTypeSelection('income')}
                                className="flex-1 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-medium rounded-lg transition-all"
                            >
                                <Banknote className="w-4 h-4 inline mr-1" /> Income<br />
                                <span className="text-xs font-normal text-emerald-400/70">(Salary, gift, etc.)</span>
                            </button>
                            <button
                                onClick={() => handleTypeSelection('reimbursement')}
                                className="flex-1 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium rounded-lg transition-all"
                            >
                                <ArrowLeftRight className="w-4 h-4 inline mr-1" /> Reimbursement<br />
                                <span className="text-xs font-normal text-amber-400/70">(Payback for shared expense)</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Bottom Row: Controls */}
                {(!isIncoming || classificationStep === 'categorize') && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full items-stretch">

                        {/* Merchant Name Input */}
                        <input
                            type="text"
                            value={merchantName}
                            onChange={(e) => setMerchantName(e.target.value)}
                            placeholder="Merchant Name"
                            className="input-base w-full sm:flex-1"
                        />

                        {/* Notes Input */}
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={incomeType === 'reimbursement' ? "Context (e.g., Pizza split)" : "Add context..."}
                            className="input-base w-full sm:w-48"
                        />

                        {/* Category Select */}
                        <div className="relative w-full sm:w-48">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className={`input-base appearance-none pr-8 ${suggestions.includes(selectedCategory) ? 'text-violet-300 font-medium bg-violet-500/10 border-violet-500/30' : ''}`}
                            >
                                <option value="" className="text-slate-500">Select Category...</option>
                                {suggestions.length > 0 && (
                                    <optgroup label="✨ AI Suggestions">
                                        {suggestions.map(c => (
                                            <option key={c} value={c} className="text-slate-900">✨ {c}</option>
                                        ))}
                                    </optgroup>
                                )}
                                <optgroup label="All Categories">
                                    {remainingCategories.map(c => (
                                        <option key={c} value={c} className="text-slate-900">{c}</option>
                                    ))}
                                </optgroup>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted lowercase text-xs">▼</div>
                        </div>

                        {/* Action */}
                        <button
                            onClick={handleApprove}
                            disabled={!selectedCategory || isProcessing}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg shadow-lg hover:shadow-violet-500/25 whitespace-nowrap active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isProcessing ? 'Saving...' : 'Approve'}
                        </button>
                    </div>
                )}
            </div>

            {/* Learn Rule Checkbox */}
            {
                (!isIncoming || classificationStep === 'categorize') && (
                    <div className="flex items-center gap-2 mt-3 pl-0 sm:pl-0">
                        <input
                            type="checkbox"
                            id={`learn-${transaction.id}`}
                            className="rounded border-slate-600 bg-slate-800 text-violet-600 focus:ring-violet-500"
                            checked={learnRule}
                            onChange={e => setLearnRule(e.target.checked)}
                        />
                        <label htmlFor={`learn-${transaction.id}`} className="text-xs text-muted select-none cursor-pointer">
                            Always categorize <strong className="text-slate-300">{merchantName}</strong> as <strong className="text-slate-300">{selectedCategory || 'this'}</strong>?
                        </label>
                    </div>
                )
            }
        </div>
    );
}
