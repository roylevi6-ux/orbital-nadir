/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSalaryStatus, addSalary, removeSalary, SalaryStatus } from '@/app/actions/salary';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function SalaryWidget({ onSuccess }: { onSuccess?: () => void }) {
    const [status, setStatus] = useState<SalaryStatus>({ total: 0, entries: [] });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (mounted) fetchStatus();
    }, [mounted, viewDate]);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const data = await getSalaryStatus(viewDate);
            setStatus(data);
        } catch (error) {
            console.error('Failed to fetch salary status', error);
        } finally {
            setLoading(false);
        }
    };

    const changeMonth = (offset: number) => {
        const newDate = new Date(viewDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setViewDate(newDate);
    };

    const handleSubmit = async () => {
        if (!amount) return;
        setSubmitting(true);
        try {
            const result = await addSalary(Number(amount), viewDate);
            if (result.success) {
                toast.success('Salary added!');
                setAmount('');
                await fetchStatus();
                if (onSuccess) onSuccess();
            } else {
                toast.error('Failed to add salary', { description: result.error });
            }
        } catch (error) {
            console.error('Error adding salary:', error);
            toast.error('An unexpected error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remove this salary entry?')) return;
        try {
            const result = await removeSalary(id);
            if (result.success) {
                toast.success('Entry removed');
                await fetchStatus();
                if (onSuccess) onSuccess();
            } else {
                toast.error('Failed to remove entry');
            }
        } catch (e) {
            toast.error('Error removing entry');
        }
    };

    if (loading && !status) return null;

    const currentMonthLabel = format(viewDate, 'MMMM yyyy');
    const hasSalary = status.total > 0;

    return (
        <>
            {/* Widget Card */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg" aria-label="Salary">$$</span>
                    <span className="text-sm font-bold text-white hidden md:inline">Salary</span>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className={`px-4 py-2 font-medium rounded-lg transition-all border whitespace-nowrap flex items-center gap-2 ${hasSalary
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                        }`}
                >
                    {hasSalary ? (
                        <>
                            <span className="text-xs uppercase tracking-wider opacity-70">Total ({format(viewDate, 'MMM')})</span>
                            <span className="font-bold text-lg">{status.total.toLocaleString()}</span>
                            <span className="text-xs">NIS</span>
                        </>
                    ) : (
                        `+ Salary (${format(viewDate, 'MMM')})`
                    )}
                </button>
            </div>

            {/* Modal - Portaled to Body */}
            {showModal && mounted && createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl shadow-violet-500/10 relative overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 relative z-10 bg-slate-900/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-white">Salary Manager</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <button
                                        onClick={() => changeMonth(-1)}
                                        className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
                                    >
                                        ◀
                                    </button>
                                    <p className="text-emerald-400 font-medium min-w-[100px] text-center">{currentMonthLabel}</p>
                                    <button
                                        onClick={() => changeMonth(1)}
                                        className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
                                    >
                                        ▶
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
                        </div>

                        {/* List of Entries */}
                        <div className="p-6 overflow-y-auto space-y-4">
                            {status.entries.length > 0 ? (
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500">Entries for {format(viewDate, 'MMMM')}</label>
                                    {status.entries.map(entry => (
                                        <div key={entry.id} className="flex justify-between items-center bg-slate-900 border border-white/5 p-3 rounded-xl">
                                            <div>
                                                <span className="font-mono text-emerald-400 font-medium text-lg">{entry.amount.toLocaleString()}</span>
                                                <span className="text-xs text-slate-500 ml-2">NIS</span>
                                                <p className="text-xs text-slate-600">{entry.date}</p>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(entry.id)}
                                                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))}

                                    <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                                        <span className="text-sm font-medium text-slate-400">Total</span>
                                        <span className="font-bold text-white text-xl">{status.total.toLocaleString()} NIS</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-slate-500 italic">
                                    No salary entries for {format(viewDate, 'MMMM')}.
                                </div>
                            )}

                            {/* Add New */}
                            <div className="bg-slate-950/50 p-4 rounded-xl border border-dashed border-white/10 mt-4">
                                <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Add Entry for {format(viewDate, 'MMMM')}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="Amount"
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-violet-500 outline-none font-mono"
                                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                    />
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting || !amount}
                                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold disabled:opacity-50"
                                    >
                                        + Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
