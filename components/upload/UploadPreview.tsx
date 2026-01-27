/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ParsedTransaction } from '@/lib/parsing/types';
import { saveTransactions } from '@/app/actions/save-transactions';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PreviewFile {
    fileId: string;
    transactions: ParsedTransaction[];
    sourceType: string;
}

interface UploadPreviewProps {
    files: PreviewFile[];
    onCancel: () => void;
    onSuccess: () => void;
}

export default function UploadPreview({ files, onCancel, onSuccess }: UploadPreviewProps) {
    const router = useRouter();

    const [allTransactions, setAllTransactions] = useState(() => {
        // Flatten all files into one list
        return files.flatMap(file =>
            file.transactions.map(t => ({
                ...t,
                sourceFile: file.fileId,
                sourceType: file.sourceType,
                uiType: t.type === 'income' ? 'income' : 'expense'
            }))
        );
    });

    const [status, setStatus] = useState<'idle' | 'saving' | 'ai' | 'reconciling' | 'submitting'>('idle');
    const [progressLog, setProgressLog] = useState<string[]>([]);
    const [elapsed, setElapsed] = useState(0);

    const handleSave = async () => {
        setStatus('saving');
        setProgressLog(prev => [...prev, 'Starting save process...']);

        try {
            // Group by source type if needed, but saveTransactions handles array
            const result = await saveTransactions(
                allTransactions.map(t => ({
                    ...t,
                    type: t.uiType === 'income' ? 'income' : 'expense'
                })),
                files[0]?.sourceType || 'upload' // Use first file's type or generic
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to save transactions');
            }

            const count = result.data.count;
            setProgressLog(prev => [...prev, `Successfully saved ${count} transactions!`]);
            toast.success(`Saved ${count} transactions`);
            onSuccess();
            router.push('/transactions');
            router.refresh();
        } catch (e: unknown) {
            console.error(e);
            toast.error('Failed to save transactions');
            setStatus('idle');
        }
    };

    if (status !== 'idle') {
        return (
            <div className="card p-12 text-center animate-in fade-in">
                <Loader2 className="w-12 h-12 text-violet-500 animate-spin mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Processing...</h3>
                <div className="text-sm text-slate-400 font-mono space-y-1">
                    {progressLog.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">Review {allTransactions.length} Transactions</h2>
                    <p className="text-sm text-slate-400">
                        Found in {files.length} file{files.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="btn-secondary">Cancel</button>
                    <button onClick={handleSave} className="btn-primary bg-violet-600 hover:bg-violet-500">
                        Save All
                    </button>
                </div>
            </div>

            <div className="card p-0 overflow-hidden border-white/10">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-slate-400 font-medium">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Merchant</th>
                            <th className="p-4">Amount</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Source</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {allTransactions.map((t, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 whitespace-nowrap text-sm font-mono">
                                    {new Date(t.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
                                </td>
                                <td className="p-4 font-medium text-white">{t.merchant_raw}</td>
                                <td className="p-4 font-mono">{t.amount} {t.currency}</td>
                                <td className="p-4">
                                    <select
                                        value={t.uiType}
                                        onChange={(e) => {
                                            const newTx = [...allTransactions];
                                            newTx[i].uiType = e.target.value;
                                            setAllTransactions(newTx);
                                        }}
                                        className="bg-transparent border-none text-slate-300 focus:ring-0 p-0 cursor-pointer"
                                    >
                                        <option value="expense" className="bg-slate-900">Expense</option>
                                        <option value="income" className="bg-slate-900">Income</option>
                                    </select>
                                </td>
                                <td className="p-4 text-xs text-slate-500">{t.sourceFile}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
