'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ParsedTransaction } from '@/lib/parsing/types';
import { saveTransactions } from '@/app/actions/save-transactions';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
    fileId: string;
    initialTransactions: ParsedTransaction[];
    sourceType?: string;
    onCancel: () => void;
    onSuccess: () => void;
}

export default function UploadPreview({ files, onCancel, onSuccess }: { files: { fileId: string, transactions: ParsedTransaction[], sourceType?: string }[], onCancel: () => void, onSuccess: () => void }) {
    const router = useRouter();

    const [allTransactions, setAllTransactions] = useState(() => {
        return files.flatMap(f => f.transactions.map(t => ({
            ...t,
            sourceFile: f.fileId,
            sourceType: f.sourceType,
            uiType: t.type === 'income' ? 'income' : 'expense' // Local UI state for dropdown
        })));
    });

    const [status, setStatus] = useState<'idle' | 'saving' | 'ai' | 'reconciling' | 'submitting'>('idle');
    const [progressLog, setProgressLog] = useState<string[]>([]);
    const [elapsed, setElapsed] = useState(0);

    // Timer for processing
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status !== 'idle') {
            const start = Date.now();
            interval = setInterval(() => {
                setElapsed(Math.floor((Date.now() - start) / 1000));
            }, 1000);
        } else {
            setElapsed(0);
        }
        return () => clearInterval(interval);
    }, [status]);

    const handleChange = (index: number, field: string, value: any) => {
        setAllTransactions(prev => prev.map((t, i) => {
            if (i !== index) return t;

            // Handle UI Type change
            if (field === 'uiType') {
                return { ...t, uiType: value };
            }

            return { ...t, [field]: value };
        }));
    };

    const appendLog = (msg: string) => setProgressLog(prev => [msg, ...prev]);

    const handleProcessAll = async () => {
        setStatus('saving');
        setProgressLog(['💾 Saving transactions...']);

        try {
            // Group by source type
            const groups = new Map<string, typeof allTransactions>();
            for (const tx of allTransactions) {
                const sType = (tx as any).sourceType || 'upload';
                if (!groups.has(sType)) groups.set(sType, []);
                groups.get(sType)!.push(tx);
            }

            for (const [sType, txs] of groups.entries()) {
                // Prepare for DB
                const dbTxs = txs.map(t => {
                    let finalAmount = Math.abs(Number(t.amount));
                    let finalType = t.type;
                    let isReimbursement = false;

                    // Logic:
                    // Expense -> Amount Positive (standard), Type 'expense'
                    // Income -> Amount Positive, Type 'income'
                    // Reimbursement -> Amount Negative, Type 'expense', is_reimbursement = true

                    if (t.uiType === 'reimbursement') {
                        finalAmount = -finalAmount; // Negative Expense
                        finalType = 'expense';
                        isReimbursement = true;
                    } else if (t.uiType === 'income') {
                        finalType = 'income';
                    } else {
                        finalType = 'expense';
                        // Normal expense, amount stays positive (absolute) as per convention?
                        // Wait, if we use positive for expense, then reimbursement (negative expense) works perfectly to offset.
                    }

                    return {
                        ...t,
                        amount: finalAmount,
                        type: finalType,
                        is_reimbursement: isReimbursement
                    };
                });

                appendLog(`Saving ${txs.length} items from ${sType}...`);
                await saveTransactions(dbTxs, sType);
            }
            appendLog('✅ Save complete');

            // 2. AI Categorization
            setStatus('ai');
            appendLog('🤖 Running AI Auto-Categorization...');

            const { aiCategorizeTransactions } = await import('@/app/actions/ai-categorize');

            let aiRound = 1;
            let totalCategorized = 0;
            const maxRounds = 30;

            while (aiRound <= maxRounds) {
                // Determine if we should keep going? 
                // We'll trust the server action to return 0 when done.
                if (aiRound > 1) await new Promise(r => setTimeout(r, 800)); // Pace it

                const res = await aiCategorizeTransactions();

                if (res.error) {
                    appendLog(`⚠️ AI Error: ${res.error}`);
                    break;
                }

                if (res.count === 0) {
                    appendLog('✅ AI Analysis Complete.');
                    break;
                }

                totalCategorized += res.count;
                appendLog(`   • Batch ${aiRound}: Analyzed ${res.count} items`);
                aiRound++;
            }

            // 3. Reconciliation
            setStatus('reconciling');
            appendLog('🔗 Checking for duplicates...');
            const { reconcileTransactions } = await import('@/app/actions/reconcile-transactions');
            const recRes = await reconcileTransactions();
            appendLog(`✅ Reconciliation: ${recRes.count || 0} links found`);

            // Done
            setStatus('submitting');
            appendLog('🚀 Redirecting to Review Session...');

            setTimeout(() => {
                router.push('/review');
            }, 1000);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
            setStatus('idle');
        }
    };

    return (
        <div className="card overflow-hidden flex flex-col h-[70vh] bg-slate-900 border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-slate-900 sticky top-0 z-20">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Preview & Verify
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-mono text-muted">
                            {allTransactions.length} items
                        </span>
                    </h3>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={status !== 'idle'}
                        className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleProcessAll}
                        disabled={status !== 'idle' || allTransactions.length === 0}
                        className="px-6 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg shadow-lg shadow-violet-500/20 disabled:opacity-50 flex items-center gap-2 transition-all"
                    >
                        {status !== 'idle' ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            'Process Transactions'
                        )}
                    </button>
                </div>
            </div>

            {/* Content Container */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* Table */}
                <div className={cn("flex-1 overflow-auto transition-opacity duration-500", status !== 'idle' ? "opacity-30 pointer-events-none" : "opacity-100")}>
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted uppercase bg-slate-950/50 sticky top-0 z-10 border-b border-white/5 backdrop-blur-sm">
                            <tr>
                                <th className="px-6 py-4 w-[140px]">Date</th>
                                <th className="px-6 py-4">Description</th>
                                <th className="px-6 py-4 w-[120px]">Amount</th>
                                <th className="px-6 py-4 w-[160px]">Type</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {allTransactions.map((t, i) => (
                                <tr key={i} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-3">
                                        <input
                                            type="text"
                                            value={t.date}
                                            onChange={(e) => handleChange(i, 'date', e.target.value)}
                                            className="bg-transparent border-none focus:ring-0 p-0 w-24 text-slate-300 font-mono text-xs focus:text-white transition-colors placeholder:text-muted/50"
                                        />
                                    </td>
                                    <td className="px-6 py-3">
                                        <input
                                            type="text"
                                            value={t.merchant_raw}
                                            onChange={(e) => handleChange(i, 'merchant_raw', e.target.value)}
                                            className="bg-transparent border-none focus:ring-0 p-0 w-full text-slate-200 font-medium focus:text-white transition-colors"
                                        />
                                        <div className="text-[10px] text-muted opacity-50">{t.sourceFile}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-1 font-mono text-slate-300">
                                            <span className="text-muted text-xs">₪</span>
                                            <input
                                                type="number"
                                                value={t.amount}
                                                onChange={(e) => handleChange(i, 'amount', parseFloat(e.target.value))}
                                                className={cn(
                                                    "bg-transparent border-none focus:ring-0 p-0 w-20 font-bold",
                                                    (t as any).uiType === 'reimbursement' ? "text-emerald-400" :
                                                        (t as any).uiType === 'income' ? "text-emerald-400" : "text-white"
                                                )}
                                            />
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <select
                                            value={(t as any).uiType}
                                            onChange={(e) => handleChange(i, 'uiType', e.target.value)}
                                            className={cn(
                                                "bg-transparent border border-white/10 text-xs font-medium px-2 py-1 rounded-md cursor-pointer focus:ring-1 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all",
                                                (t as any).uiType === 'reimbursement' ? "text-cyan-400 bg-cyan-950/30 border-cyan-500/30" :
                                                    (t as any).uiType === 'income' ? "text-emerald-400 bg-emerald-950/30 border-emerald-500/30" :
                                                        "text-rose-300 bg-rose-950/30 border-rose-500/30"
                                            )}
                                        >
                                            <option value="expense" className="bg-slate-900 text-rose-300">Expense</option>
                                            <option value="income" className="bg-slate-900 text-emerald-400">Income</option>
                                            <option value="reimbursement" className="bg-slate-900 text-cyan-400">Reimbursement</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Processing Overlay */}
                {status !== 'idle' && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-slate-950/60 animate-in fade-in duration-500">
                        <div className="w-[400px] bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-6 relative overflow-hidden">
                            {/* Glow */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-violet-500 to-transparent animate-pulse" />

                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-500/10 text-violet-400 mb-4 ring-1 ring-violet-500/20">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">Processing Transactions</h3>
                                <div className="font-mono text-xs text-violet-300">
                                    Time elapsed: {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
                                </div>
                            </div>

                            {/* Logs */}
                            <div className="bg-black/50 rounded-lg p-3 h-32 overflow-y-auto border border-white/5 font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
                                {progressLog.map((log, i) => (
                                    <div key={i} className={cn(
                                        "flex items-start gap-2",
                                        i === 0 ? "text-white" : "text-muted opacity-80"
                                    )}>
                                        <span className="opacity-50">›</span>
                                        <span>{log}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
