'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, addMonths, isSameMonth } from 'date-fns';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

type Props = {
    onChange: (from: Date, to: Date) => void;
    currentRange: { from: Date, to: Date };
};

export default function TimeRangeSelector({ onChange, currentRange }: Props) {
    const [viewYear, setViewYear] = React.useState(new Date().getFullYear());
    const [isOpen, setIsOpen] = React.useState(false);

    // Simple Presets
    const selectPreset = (months: number) => {
        const end = endOfMonth(new Date()); // Today/This Month end?
        // Usually "Last X Months" includes current? Or completed?
        // Let's assume inclusive of current month for now, or last completed?
        // User said "Jan 2026". "Last 12 months" usually means [Now-11mo, Now].
        const now = new Date();
        const start = startOfMonth(subMonths(now, months - 1));
        const to = endOfMonth(now);
        onChange(start, to);
        setIsOpen(false);
    };

    const selectMonth = (monthIndex: number) => {
        const start = new Date(viewYear, monthIndex, 1);
        const end = endOfMonth(start);
        onChange(start, end);
        setIsOpen(false);
    };

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const label = `${format(currentRange.from, 'MMM yyyy')}${isSameMonth(currentRange.from, currentRange.to)
            ? ''
            : ` - ${format(currentRange.to, 'MMM yyyy')}`
        }`;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-white transition-colors">
                    <Calendar size={16} className="text-violet-400" />
                    <span>{label}</span>
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-slate-900 border border-white/10 text-white">
                <div className="p-4 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold">Select Time Period</h3>
                    </div>

                    {/* Presets */}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => selectPreset(1)} className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs">This Month</button>
                        <button onClick={() => {
                            const last = subMonths(new Date(), 1);
                            onChange(startOfMonth(last), endOfMonth(last));
                            setIsOpen(false);
                        }} className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs">Last Month</button>
                        <button onClick={() => selectPreset(3)} className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs">Last 3 Months</button>
                        <button onClick={() => selectPreset(12)} className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs">Last 12 Months</button>
                    </div>

                    <hr className="border-white/10" />

                    {/* Manual Month Selection */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <button onClick={() => setViewYear(y => y - 1)} className="p-1 hover:bg-white/10 rounded"><ChevronLeft size={20} /></button>
                            <span className="font-bold font-mono">{viewYear}</span>
                            <button onClick={() => setViewYear(y => y + 1)} className="p-1 hover:bg-white/10 rounded"><ChevronRight size={20} /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {months.map((m, i) => (
                                <button
                                    key={m}
                                    onClick={() => selectMonth(i)}
                                    className={`p-3 rounded text-sm font-medium transition-colors ${isSameMonth(currentRange.from, new Date(viewYear, i, 1)) && isSameMonth(currentRange.to, endOfMonth(new Date(viewYear, i, 1)))
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400'
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
