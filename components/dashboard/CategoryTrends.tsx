'use client';

import { TopCategory } from '@/app/actions/get-dashboard-data';
import { getCategoryStyles } from './CategoryIcon';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export default function CategoryTrends({ categories }: { categories: TopCategory[] }) {
    if (categories.length === 0) return null;

    // Sort by largest absolute impact? Or just render top 5 spenders with their trends?
    // Let's show top 5 spenders.
    const top = categories.slice(0, 5);

    return (
        <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="font-bold text-white">Monthly Trends</h3>
                <span className="text-xs text-muted">vs Prev Period</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {top.map((cat, i) => {
                    const style = getCategoryStyles(cat.name);
                    const Icon = style.icon;
                    const change = cat.change || 0;

                    return (
                        <div key={i} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${style.bg} ${style.border}`}>
                                    <Icon className={`w-4 h-4 ${style.color}`} />
                                </div>
                                <div>
                                    <div className="font-medium text-white">{cat.name}</div>
                                    <div className="text-xs text-slate-500">{Math.round(cat.percentage)}% of spend</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-white">₪{cat.amount.toLocaleString()}</div>
                                <div className={`text-xs flex items-center justify-end gap-1 ${change > 10 ? 'text-rose-400' :
                                        change < -10 ? 'text-emerald-400' :
                                            'text-slate-400'
                                    }`}>
                                    {change > 0 ? <ArrowUpRight size={12} /> :
                                        change < 0 ? <ArrowDownRight size={12} /> :
                                            <Minus size={12} />}
                                    <span>{Math.abs(change)}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
