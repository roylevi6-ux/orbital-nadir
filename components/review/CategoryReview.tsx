'use client';

import { useState } from 'react';
import { updateTransactionCategory } from '@/app/actions/update-category'; // We will need to create this or use existing
import { Check, X, Tag, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Simplified categories list availability? 
// We should probably pass categories as props or fetch them? 
// For now, let's just use a text input or a simplified selector for MVP Phase A.
// Actually, strict category selection is important. 
// Let's assume we pass suggestions from AI.

interface Transaction {
    id: string;
    date: string;
    merchant_raw: string;
    merchant_normalized?: string;
    amount: number;
    currency: string;
    ai_suggestions?: string[];
    category?: string;
}

export default function CategoryReview({ transaction }: { transaction: Transaction }) {
    const [isVisible, setIsVisible] = useState(true);
    const [loading, setLoading] = useState(false);

    // AI Best Guess
    const primarySuggestion = transaction.category || transaction.ai_suggestions?.[0];

    const handleApprove = async () => {
        if (!primarySuggestion) return;
        setLoading(true);
        try {
            await updateTransactionCategory(transaction.id, primarySuggestion, transaction.merchant_normalized);
            toast.success('Confirmed category: ' + primarySuggestion);
            setIsVisible(false);
        } catch (e) {
            toast.error('Failed to update');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSuggestion = async (cat: string) => {
        setLoading(true);
        try {
            await updateTransactionCategory(transaction.id, cat, transaction.merchant_normalized);
            toast.success('Categorized as: ' + cat);
            setIsVisible(false);
        } catch (e) {
            toast.error('Failed to update');
        } finally {
            setLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="card p-5 border border-white/5 hover:border-violet-500/30 transition-all group bg-slate-900/50">
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">

                {/* Transaction Info */}
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-mono text-muted border border-white/10 px-2 py-0.5 rounded">
                            {new Date(transaction.date).toLocaleDateString('en-GB')}
                        </span>
                        <span className="text-rose-400 font-bold font-mono">
                            -{transaction.amount.toLocaleString()} ₪
                        </span>
                    </div>
                    <h3 className="text-lg font-medium text-white group-hover:text-violet-200 transition-colors">
                        {transaction.merchant_normalized || transaction.merchant_raw}
                    </h3>
                    <p className="text-sm text-muted line-clamp-1">{transaction.merchant_raw}</p>
                </div>

                {/* AI Suggestions Area */}
                <div className="flex flex-col items-end gap-3 w-full md:w-auto">

                    {/* Primary Action */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex-1 md:flex-initial text-right text-sm text-violet-300 mr-2 flex items-center justify-end gap-2">
                            <span className="bg-violet-500/10 px-2 py-1 rounded text-xs flex items-center gap-1 border border-violet-500/10">
                                🤖 AI Guess
                            </span>
                            {primarySuggestion ? primarySuggestion : 'Unknown'}
                        </div>

                        <button
                            onClick={handleApprove}
                            disabled={loading || !primarySuggestion}
                            className="bg-violet-600 hover:bg-violet-500 text-white p-2 rounded-lg transition-all shadow-lg shadow-violet-900/20 disabled:opacity-50 disabled:grayscale"
                            title="Confirm this category"
                        >
                            {loading ? <div className="w-5 h-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Alternative Suggestions */}
                    {transaction.ai_suggestions && transaction.ai_suggestions.length > 1 && (
                        <div className="flex gap-2 flex-wrap justify-end">
                            {transaction.ai_suggestions.slice(1, 3).map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => handleSelectSuggestion(cat)}
                                    disabled={loading}
                                    className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs text-muted hover:text-white border border-white/5 transition-colors"
                                >
                                    Map to {cat}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
