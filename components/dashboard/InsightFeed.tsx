'use client';

import { Insight } from '@/app/actions/analytics';
import { AlertCircle, TrendingUp, TrendingDown, Info } from 'lucide-react';

export default function InsightFeed({ insights }: { insights: Insight[] }) {
    if (insights.length === 0) return null;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Smart Insights</h3>
            {insights.map((insight) => (
                <div key={insight.id} className={`p-4 rounded-xl border flex gap-3 ${insight.type === 'warning' ? 'bg-rose-950/20 border-rose-500/20' :
                        insight.type === 'positive' ? 'bg-emerald-950/20 border-emerald-500/20' :
                            'bg-slate-800/50 border-white/5'
                    }`}>
                    <div className={`mt-0.5 ${insight.type === 'warning' ? 'text-rose-400' :
                            insight.type === 'positive' ? 'text-emerald-400' :
                                'text-blue-400'
                        }`}>
                        {insight.type === 'warning' ? <AlertCircle size={18} /> :
                            insight.type === 'positive' ? <TrendingUp size={18} /> :
                                <Info size={18} />}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold ${insight.type === 'warning' ? 'text-rose-200' :
                                insight.type === 'positive' ? 'text-emerald-200' :
                                    'text-slate-200'
                            }`}>{insight.title}</h4>
                        <p className="text-xs text-slate-400 mt-1">{insight.message}</p>
                        {insight.metric && (
                            <div className="mt-2 text-lg font-mono font-medium text-white">
                                {insight.metric}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
