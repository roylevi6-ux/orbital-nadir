'use client';

import { useEffect, useState } from 'react';
import { getAccounts, Account } from '@/app/actions/accounts';
import AccountCard from '@/components/accounts/AccountCard';
import NewAccountModal from '@/components/accounts/NewAccountModal';
import { toast } from 'sonner';
import { format } from 'date-fns';
import AppShell from '@/components/layout/AppShell';

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [netWorth, setNetWorth] = useState(0);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const { accounts, netWorthILS } = await getAccounts();
            setAccounts(accounts);
            setNetWorth(netWorthILS);
        } catch (e) {
            console.error(e);
            toast.error('Failed to load accounts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading) return (
        <AppShell>
            <div className="p-8 text-center text-[var(--text-muted)] 500">Loading accounts...</div>
        </AppShell>
    );

    const byType = accounts.reduce((acc, curr) => {
        if (!acc[curr.type]) acc[curr.type] = [];
        acc[curr.type].push(curr);
        return acc;
    }, {} as Record<string, Account[]>);

    return (
        <AppShell>
            <main className="p-8 space-y-8 animate-in fade-in">
                {/* Header */}
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Savings & Investments</h1>
                        <p className="text-[var(--text-muted)] 400">Track your assets across all currencies.</p>
                    </div>
                    <NewAccountModal onComplete={loadData} />
                </div>

                {/* Net Worth Card */}
                <div className="bg-gradient-to-br from-violet-900/50 to-slate-900 border border-white/10 rounded-3xl p-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/20 blur-[100px] rounded-full pointer-events-none" />
                    <h2 className="text-sm font-bold uppercase text-violet-300 mb-1 relative z-10">Total Net Worth</h2>
                    <div className="text-5xl font-mono font-bold text-white relative z-10">
                        ₪{netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <p className="text-[var(--text-muted)] 400 mt-2 text-sm max-w-md relative z-10">
                        Combined value of all your savings, checking, investment, and crypto accounts converted to ILS.
                    </p>
                </div>

                {/* Account Grid */}
                <div className="space-y-8">
                    {Object.entries(byType).map(([type, typeAccounts]) => (
                        <div key={type}>
                            <h3 className="text-xl font-bold text-white capitalize mb-4 flex items-center gap-2">
                                {type} <span className="text-xs bg-slate-800 text-[var(--text-muted)] 400 px-2 py-1 rounded-full">{typeAccounts.length}</span>
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {typeAccounts.map(acc => (
                                    <AccountCard key={acc.id} account={acc} onUpdate={loadData} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {accounts.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-[var(--border-glass)] rounded-3xl">
                        <p className="text-[var(--text-muted)] 500 mb-4">No accounts tracked yet.</p>
                        <NewAccountModal onComplete={loadData} />
                    </div>
                )}
            </main>
        </AppShell>
    );
}
