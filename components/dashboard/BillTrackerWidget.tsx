'use client';

import { PredictedBill } from '@/app/actions/analytics';
import { CalendarClock } from 'lucide-react';

export default function BillTrackerWidget({ bills }: { bills: PredictedBill[] }) {
    if (bills.length === 0) return (
        <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5 text-center">
            <CalendarClock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No upcoming bills predicted.</p>
        </div>
    );

    return (
        <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/5">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CalendarClock size={16} /> Upcoming Bills
            </h3>
            <div className="space-y-4">
                {bills.map((bill, i) => (
                    <div key={i} className="flex items-center justify-between group">
                        <div className="flex gap-3 items-center">
                            <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-slate-800 border border-white/5 font-mono text-xs">
                                <span className="text-rose-400 font-bold">{new Date(bill.predictedDate).getDate()}</span>
                                <span className="text-slate-500 text-[9px] uppercase">{new Date(bill.predictedDate).toLocaleDateString('en-US', { month: 'short' })}</span>
                            </div>
                            <div>
                                <p className="font-medium text-slate-200 group-hover:text-white transition-colors">{bill.merchant}</p>
                                <p className="text-xs text-slate-500">
                                    {bill.daysUntil === 0 ? 'Due Today' :
                                        bill.daysUntil === 1 ? 'Tomorrow' :
                                            `In ${bill.daysUntil} days`}
                                </p>
                            </div>
                        </div>
                        <div className="text-right font-mono text-slate-300">
                            ~{bill.avgAmount.toLocaleString()} ₪
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
