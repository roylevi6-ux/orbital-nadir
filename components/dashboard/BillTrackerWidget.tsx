'use client';

import { PredictedBill } from '@/app/actions/analytics';
import { CalendarClock } from 'lucide-react';

export default function BillTrackerWidget({ bills }: { bills: PredictedBill[] }) {
    if (bills.length === 0) return (
        <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-glass)] text-center">
            <CalendarClock className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
            <p className="text-[var(--text-muted)] text-sm">No upcoming bills predicted.</p>
        </div>
    );

    return (
        <div className="holo-card">
            <h3 className="text-sm font-bold text-[var(--neon-purple)] uppercase tracking-wider mb-4 flex items-center gap-2">
                <CalendarClock size={16} /> 💫 Upcoming Bills
            </h3>
            <div className="space-y-4">
                {bills.map((bill, i) => (
                    <div key={i} className="flex items-center justify-between group">
                        <div className="flex gap-3 items-center">
                            <div className="icon-glow w-10 h-10 font-mono text-xs flex flex-col">
                                <span className="text-[var(--neon-pink)] font-bold">{new Date(bill.predictedDate).getDate()}</span>
                                <span className="text-[var(--text-muted)] text-[9px] uppercase">{new Date(bill.predictedDate).toLocaleDateString('en-US', { month: 'short' })}</span>
                            </div>
                            <div>
                                <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--neon-blue)] transition-colors">{bill.merchant}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    {bill.daysUntil === 0 ? 'Due Today' :
                                        bill.daysUntil === 1 ? 'Tomorrow' :
                                            `In ${bill.daysUntil} days`}
                                </p>
                            </div>
                        </div>
                        <div className="text-right font-mono text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-pink)] to-[var(--neon-purple)]">
                            ~{bill.avgAmount.toLocaleString()} ₪
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
