'use client';

import { SpenderBreakdown } from '@/app/actions/get-spender-breakdown';
import { Users } from 'lucide-react';

interface SpenderBreakdownWidgetProps {
    data: SpenderBreakdown | null;
    loading?: boolean;
}

export default function SpenderBreakdownWidget({ data, loading }: SpenderBreakdownWidgetProps) {
    if (loading) {
        return (
            <div className="holo-card p-5 animate-pulse">
                <div className="h-5 w-32 bg-white/10 rounded mb-4" />
                <div className="space-y-3">
                    <div className="h-12 bg-white/5 rounded-lg" />
                    <div className="h-12 bg-white/5 rounded-lg" />
                </div>
            </div>
        );
    }

    if (!data || data.spenders.length === 0) {
        return (
            <div className="holo-card p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-[var(--neon-purple)]" />
                    <h3 className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]">
                        Spending by Person
                    </h3>
                </div>
                <p className="text-sm text-[var(--text-muted)] text-center py-4">
                    No spender data yet. Upload transactions with spender info to see the breakdown.
                </p>
            </div>
        );
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', {
            style: 'currency',
            currency: 'ILS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="holo-card p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[var(--neon-purple)]" />
                    <h3 className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]">
                        Spending by Person
                    </h3>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                    {formatCurrency(data.total_expenses)} total
                </span>
            </div>

            <div className="space-y-4">
                {data.spenders.map((spender) => (
                    <div key={spender.spender_key} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                                    style={{
                                        backgroundColor: `${spender.color}30`,
                                        color: spender.color,
                                        border: `2px solid ${spender.color}50`
                                    }}
                                >
                                    {spender.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <span className="font-medium text-white">{spender.display_name}</span>
                                    <span className="text-xs text-[var(--text-muted)] ml-2">
                                        ({spender.transaction_count} transactions)
                                    </span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="font-bold text-white">{formatCurrency(spender.total_amount)}</span>
                                <span className="text-xs text-[var(--text-muted)] ml-2">
                                    ({spender.percentage}%)
                                </span>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${spender.percentage}%`,
                                    backgroundColor: spender.color
                                }}
                            />
                        </div>
                    </div>
                ))}

                {/* Unassigned transactions */}
                {data.unassigned.count > 0 && (
                    <div className="pt-3 border-t border-[var(--border-glass)]">
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)] text-xs">
                                    ?
                                </div>
                                <span className="text-[var(--text-muted)]">Unassigned</span>
                                <span className="text-xs text-[var(--text-muted)]">
                                    ({data.unassigned.count})
                                </span>
                            </div>
                            <span className="text-[var(--text-muted)]">
                                {formatCurrency(data.unassigned.amount)}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Comparison visualization */}
            {data.spenders.length === 2 && (
                <div className="mt-6 pt-4 border-t border-[var(--border-glass)]">
                    <div className="flex items-center gap-2">
                        <div
                            className="h-3 rounded-l-full transition-all duration-500"
                            style={{
                                width: `${data.spenders[0].percentage}%`,
                                backgroundColor: data.spenders[0].color
                            }}
                        />
                        <div
                            className="h-3 rounded-r-full transition-all duration-500"
                            style={{
                                width: `${data.spenders[1].percentage}%`,
                                backgroundColor: data.spenders[1].color
                            }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-xs">
                        <span style={{ color: data.spenders[0].color }}>
                            {data.spenders[0].display_name}: {data.spenders[0].percentage}%
                        </span>
                        <span style={{ color: data.spenders[1].color }}>
                            {data.spenders[1].display_name}: {data.spenders[1].percentage}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
