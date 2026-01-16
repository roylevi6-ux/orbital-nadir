'use client';

import { Insight } from '@/app/actions/analytics';
import { AlertCircle, TrendingUp, TrendingDown, Info } from 'lucide-react';

export default function InsightFeed({ insights }: { insights: Insight[] }) {
    if (insights.length === 0) return null;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-pink)] uppercase tracking-wider mb-2">⚡ Smart Insights</h3>
            {insights.map((insight) => (
                <div key={insight.id} className={`p-4 rounded-xl border flex gap-3 ${insight.type === 'warning' ? 'bg-[var(--neon-pink)]/10 border-[var(--neon-pink)]/30' :
                    insight.type === 'positive' ? 'bg-[var(--neon-green)]/10 border-[var(--neon-green)]/30' :
                        'bg-[var(--bg-card)] border-[var(--border-glass)]'
                    }`}>
                    <div className="icon-glow w-8 h-8 text-base">
                        {insight.type === 'warning' ? '🔥' :
                            insight.type === 'positive' ? '✨' :
                                '💡'}
                    </div>
                    <div>
                        <h4 className={`text-sm font-bold ${insight.type === 'warning' ? 'text-[var(--neon-pink)]' :
                                insight.type === 'positive' ? 'text-[var(--neon-green)]' :
                                    'text-[var(--neon-blue)]'
                            }`}>{insight.title}</h4>
                        <p className="text-xs text-[var(--text-muted)] mt-1">{insight.message}</p>
                        {insight.metric && (
                            <div className="mt-2 text-lg font-mono font-medium text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-blue)] to-[var(--neon-pink)]">
                                {insight.metric}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
