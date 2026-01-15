'use client';

import { useState } from 'react';
import { mergeTransactions, DuplicateCandidate } from '@/app/actions/reconcile-transactions';
import { Check, X, ArrowRight, Merge } from 'lucide-react';
import { toast } from 'sonner';
import CategorySelector from '@/components/ui/CategorySelector';

export default function DuplicateReview({ candidate }: { candidate: DuplicateCandidate }) {
    const [isVisible, setIsVisible] = useState(true);
    const [loading, setLoading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const { appTransaction, ccTransaction, confidence, reason } = candidate;

    // Use category selector?
    // We need to import CategorySelector. I will check imports above.
    // If not imported, I cannot use it easily. But I should have imported it or need to add it.
    // Wait, the file snippet showed imports. `CategorySelector` was NOT imported in `DuplicateReview.tsx` view.
    // I need to add the import too.

    // I will use replace_file_content for the whole file to be safe and clean.
    // Or I can just replace the component body if I separately add the import.
    // Let's use `multi_replace_file_content` or just overwrite the file since it's small.
    // Overwriting the file is safer to ensure imports.
    // Actually, I am inside `replace_file_content` logic now. I matched lines 1-104 (almost whole file).
    // Let's rewrite the component including imports.

    const handleMerge = async () => {
        setLoading(true);
        try {
            // Pass selectedCategory to merge
            const res = await mergeTransactions(appTransaction.id, ccTransaction.id, selectedCategory);
            if (res.success) {
                toast.success('Transactions merged successfully');
                setIsVisible(false);
            } else {
                toast.error(res.error || 'Failed to merge');
            }
        } catch (e) {
            toast.error('Error executing merge');
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = () => {
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="card p-0 border border-cyan-900/30 bg-slate-900/50">
            {/* Context Header */}
            <div className="bg-cyan-950/30 px-5 py-2 border-b border-cyan-900/30 flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                    <Merge className="w-3 h-3" />
                    <span>Match Confidence: {confidence}%</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-cyan-600/70 font-semibold">{reason}</span>
            </div>

            <div className="p-5 flex flex-col md:flex-row items-center gap-6 justify-between">

                {/* Visual Comparison */}
                <div className="flex items-center gap-4 flex-1 w-full relative">
                    {/* App Side */}
                    <div className="flex-1 opacity-75">
                        <div className="text-[10px] uppercase text-muted mb-1 tracking-wider">BIT / Paybox</div>
                        <div className="font-medium text-white">{appTransaction.merchant_raw}</div>
                        <div className="text-sm font-mono text-rose-400">
                            -{appTransaction.amount.toLocaleString()} ₪
                        </div>
                        <div className="text-xs text-muted">{new Date(appTransaction.date).toLocaleDateString('en-GB')}</div>
                    </div>

                    {/* Arrow */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 text-cyan-400">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </div>

                    {/* CC Side */}
                    <div className="flex-1 text-right">
                        <div className="text-[10px] uppercase text-emerald-500/70 mb-1 tracking-wider">Bank / Card</div>
                        <div className="font-medium text-white">{ccTransaction.merchant_raw}</div>
                        <div className="text-sm font-mono text-rose-400">
                            -{ccTransaction.amount.toLocaleString()} ₪
                        </div>
                        <div className="text-xs text-muted">{new Date(ccTransaction.date).toLocaleDateString('en-GB')}</div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto justify-end border-t md:border-t-0 border-white/5 pt-4 md:pt-0">

                    {/* Category Selector */}
                    <div className="w-full md:w-[200px]">
                        <CategorySelector
                            value={selectedCategory}
                            onChange={setSelectedCategory}
                            placeholder="Set Category (Optional)..."
                        />
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button
                            onClick={handleDismiss}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                            disabled={loading}
                        >
                            Keep Separate
                        </button>
                        <button
                            onClick={handleMerge}
                            disabled={loading}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg shadow-lg shadow-cyan-900/20 flex items-center gap-2 transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                            {loading ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check className="w-4 h-4" />}
                            Merge & Save
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
