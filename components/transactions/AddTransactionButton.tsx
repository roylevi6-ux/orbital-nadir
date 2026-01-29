'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createTransaction } from '@/app/actions/create-transaction';
import { getCategoryNames } from '@/app/actions/review-transaction';

interface Props {
    onSuccess: () => void;
}

export default function AddTransactionButton({ onSuccess }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Form state
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [merchant, setMerchant] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('ILS');
    const [type, setType] = useState<'income' | 'expense' | 'reimbursement'>('expense');
    const [category, setCategory] = useState('');
    const [notes, setNotes] = useState('');

    // Categories
    const [categories, setCategories] = useState<string[]>([]);

    useEffect(() => {
        // eslint-disable-next-line
        setMounted(true);
    }, []);

    const handleOpen = async () => {
        setIsOpen(true);
        // Load categories for default type
        const cats = await getCategoryNames('expense');
        setCategories(cats || []);
    };

    const handleTypeChange = async (newType: 'income' | 'expense' | 'reimbursement') => {
        setType(newType);
        setCategory(''); // Reset category when type changes
        // Reimbursements use expense categories (they offset expenses)
        const categoryType = newType === 'reimbursement' ? 'expense' : newType;
        const cats = await getCategoryNames(categoryType);
        setCategories(cats || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const result = await createTransaction({
            date,
            merchant_raw: merchant,
            amount: parseFloat(amount),
            currency,
            type: type === 'reimbursement' ? 'expense' : type,
            category: category || undefined,
            notes: notes || undefined,
            is_reimbursement: type === 'reimbursement'
        });

        setLoading(false);

        if (result.success) {
            // Reset form
            setMerchant('');
            setAmount('');
            setCategory('');
            setNotes('');
            setDate(new Date().toISOString().split('T')[0]);
            setIsOpen(false);
            onSuccess();
        } else {
            alert('Error creating transaction: ' + result.error);
        }
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    if (!mounted) return null;

    return createPortal(
        <>
            {/* Floating Action Button */}
            <button
                onClick={handleOpen}
                className="fixed bottom-8 right-8 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-full p-4 shadow-[0_0_30px_rgba(124,58,237,0.4)] hover:shadow-[0_0_50px_rgba(124,58,237,0.6)] hover:scale-110 active:scale-95 transition-all z-[100] group border border-white/10"
                title="Add Transaction"
            >
                <svg className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0" onClick={handleClose} />
                    <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto relative z-10 animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Add Transaction</h2>
                                    <p className="text-sm text-slate-400 mt-1">Record a new manual entry</p>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="text-slate-500 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-2 rounded-full"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Type Toggle */}
                                <div className="grid grid-cols-3 gap-1 bg-slate-950/50 p-1 rounded-xl border border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => handleTypeChange('expense')}
                                        className={`px-3 py-2.5 rounded-lg font-medium text-sm transition-all focus:outline-none ${type === 'expense'
                                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-lg'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                            }`}
                                    >
                                        Expense
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleTypeChange('income')}
                                        className={`px-3 py-2.5 rounded-lg font-medium text-sm transition-all focus:outline-none ${type === 'income'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                            }`}
                                    >
                                        Income
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleTypeChange('reimbursement')}
                                        className={`px-3 py-2.5 rounded-lg font-medium text-sm transition-all focus:outline-none ${type === 'reimbursement'
                                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-lg'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                            }`}
                                    >
                                        Refund
                                    </button>
                                </div>

                                {/* Date */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">
                                        Date
                                    </label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        required
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all"
                                    />
                                </div>

                                {/* Merchant */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">
                                        Description
                                    </label>
                                    <input
                                        type="text"
                                        value={merchant}
                                        onChange={(e) => setMerchant(e.target.value)}
                                        required
                                        placeholder="e.g., Supermarket, Salary"
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all"
                                    />
                                </div>

                                {/* Amount */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">
                                            Amount
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            required
                                            placeholder="0.00"
                                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">
                                            Currency
                                        </label>
                                        <select
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value)}
                                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all appearance-none"
                                        >
                                            <option value="ILS">₪ ILS</option>
                                            <option value="USD">$ USD</option>
                                            <option value="EUR">€ EUR</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Category */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">
                                        Category
                                    </label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all"
                                    >
                                        <option value="" className="text-slate-500 bg-slate-900">Select category...</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat} className="text-slate-200 bg-slate-900">{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">
                                        Notes
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={2}
                                        placeholder="Optional details..."
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all resize-none"
                                    />
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 pt-4 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="flex-1 px-4 py-3 border border-white/10 text-slate-300 rounded-xl hover:bg-white/5 hover:text-white transition-colors text-sm font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-violet-500/25 active:scale-95 text-sm"
                                    >
                                        {loading ? 'Creating...' : 'Create Transaction'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
