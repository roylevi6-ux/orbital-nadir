'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/auth/supabase';
import { useRouter } from 'next/navigation';
import { getDashboardData, DashboardData } from '@/app/actions/get-dashboard-data';
import { getSmartInsights, getRecurringBills, getAssetDistribution, Insight, PredictedBill, AssetStats } from '@/app/actions/analytics';
import DashboardChart from '@/components/dashboard/DashboardChart';
import AlertBadges from '@/components/dashboard/AlertBadges';
import AIChatSidebar from '@/components/dashboard/AIChatSidebar';
import AppShell from '@/components/layout/AppShell';
import InsightFeed from '@/components/dashboard/InsightFeed';
import BillTrackerWidget from '@/components/dashboard/BillTrackerWidget';
import CategoryTreemap from '@/components/dashboard/CategoryTreemap';
import CategoryTrends from '@/components/dashboard/CategoryTrends';
import { LayoutDashboard, Receipt, Wallet, CreditCard } from 'lucide-react';
import TimeRangeSelector from '@/components/dashboard/TimeRangeSelector';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { getCategoryStyles } from '@/components/dashboard/CategoryIcon';
// Radix Tabs (Implementing manually for simplicity or using a primitive if available? 
// Let's use simple state for Tabs to avoid dependency issues if radix isn't installed)
// Actually package.json didn't show radix. We'll use state.

export default function DashboardPage() {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'spending' | 'assets'>('overview');

    // Time State (Default: Last Month)
    const [currentRange, setCurrentRange] = useState<{ from: Date, to: Date }>({
        from: startOfMonth(subMonths(new Date(), 1)),
        to: endOfMonth(subMonths(new Date(), 1))
    });

    // Data States
    const [data, setData] = useState<DashboardData | null>(null);
    const [insights, setInsights] = useState<Insight[]>([]);
    const [bills, setBills] = useState<PredictedBill[]>([]);
    const [assetStats, setAssetStats] = useState<AssetStats | null>(null);

    const router = useRouter();
    const supabase = createClient();

    const refreshData = async () => {
        try {
            const fromStr = currentRange.from.toISOString();
            const toStr = currentRange.to.toISOString();

            // Parallel Fetching
            const [dashData, smartInsights, upcomingBills, assets] = await Promise.all([
                getDashboardData(fromStr, toStr),
                getSmartInsights(), // Usually independent of view range, or update to accept? 
                // Let's keep insights as "Now" context for alerts, bills as "Future".
                getRecurringBills(),
                getAssetDistribution()
            ]);

            setData(dashData);
            setInsights(smartInsights);
            setBills(upcomingBills);
            setAssetStats(assets);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    };

    // Effect on Range Change
    useEffect(() => {
        if (!loading) { // Don't double fetch on init
            refreshData();
        }
    }, [currentRange]);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            await refreshData();
            setLoading(false);
        };
        init();
    }, [router, supabase]);

    if (loading) {
        return (
            <AppShell>
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p className="text-slate-500">Analyze finances...</p>
                    </div>
                </div>
            </AppShell>
        );
    }

    const stats = data?.stats || { totalExpenses: 0, totalIncome: 0, balance: 0, netWorth: 0, transactionCount: 0, monthName: '', currency: 'ILS' };
    const chartData = data?.chartData || [];
    const recentTransactions = data?.recentTransactions || [];
    const topExpenses = data?.topExpenses || [];

    return (
        <AppShell>
            <main className="p-8 animate-in max-w-[1600px] mx-auto min-h-screen pb-20">
                <AlertBadges />

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Dashboard v2.0</h1>
                        <p className="text-muted text-sm">Financial command center.</p>
                    </div>

                    {/* Time Selector */}
                    <div className="flex gap-2">
                        <TimeRangeSelector
                            currentRange={currentRange}
                            onChange={(from, to) => setCurrentRange({ from, to })}
                        />
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="flex space-x-1 bg-white/5 p-1 rounded-xl w-fit mb-8 border border-white/5">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <LayoutDashboard size={16} /> Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('spending')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'spending' ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Receipt size={16} /> Spending
                    </button>
                    <button
                        onClick={() => setActiveTab('assets')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'assets' ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Wallet size={16} /> Assets
                    </button>
                </div>

                {/* TAB CONTENT: OVERVIEW */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="card p-5 relative overflow-hidden group hover:border-violet-500/30 transition-colors">
                                <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl grayscale group-hover:grayscale-0 transition-all">💰</div>
                                <p className="text-sm font-medium text-muted">Total Balance</p>
                                <h3 className="text-2xl font-bold text-white mt-1">{stats.balance.toLocaleString()} ₪</h3>
                            </div>
                            <div className="card p-5 relative overflow-hidden group hover:border-rose-500/30 transition-colors">
                                <p className="text-sm font-medium text-muted">Expenses</p>
                                <h3 className="text-2xl font-bold text-white mt-1">{stats.totalExpenses.toLocaleString()} ₪</h3>
                            </div>
                            <div className="card p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                                <p className="text-sm font-medium text-muted">Income</p>
                                <h3 className="text-2xl font-bold text-white mt-1">{stats.totalIncome.toLocaleString()} ₪</h3>
                            </div>
                            <div className="card p-5 relative overflow-hidden bg-gradient-to-br from-cyan-950/30 to-transparent cursor-pointer" onClick={() => router.push('/accounts')}>
                                <p className="text-sm font-medium text-cyan-200">Net Worth</p>
                                <h3 className="text-2xl font-bold text-cyan-100 mt-1">{(stats.netWorth || 0).toLocaleString()} ₪</h3>
                            </div>
                        </div>



                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Col: Insights & Activity */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="card p-6">
                                    <h3 className="font-bold text-white mb-4">Cashflow Trend</h3>
                                    <div className="h-[250px]">
                                        <DashboardChart data={chartData} />
                                    </div>
                                </div>
                                <div className="card flex flex-col h-[400px]">
                                    <CategoryTrends categories={data?.topCategories || []} />
                                </div>
                            </div>

                            {/* Right Col: Smart Widgets */}
                            <div className="space-y-6">
                                <div className="card p-6 border-violet-500/20 bg-violet-900/10">
                                    <InsightFeed insights={insights} />
                                    {insights.length === 0 && <p className="text-sm text-slate-500 text-center">No alerts for now.</p>}
                                </div>
                                <BillTrackerWidget bills={bills} />
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB CONTENT: SPENDING */}
                {activeTab === 'spending' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-3 card p-6">
                                <CategoryTreemap categories={data?.topCategories || []} />
                            </div>
                        </div>

                        {/* TOP 10 LARGEST EXPENSES */}
                        <div className="card overflow-hidden">
                            <div className="p-4 border-b border-white/5 font-bold text-white flex justify-between items-center">
                                <span>Largest Expenses</span>
                                <span className="text-xs text-slate-400">Top 10 in Period</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-muted uppercase bg-white/5 font-medium">
                                        <tr>
                                            <th className="px-6 py-3">Merchant</th>
                                            <th className="px-6 py-3">Category</th>
                                            <th className="px-6 py-3">Date</th>
                                            <th className="px-6 py-3 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {topExpenses.map((tx) => {
                                            const style = getCategoryStyles(tx.category || '', tx.merchant);
                                            const Icon = style.icon;
                                            return (
                                                <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${style.bg} ${style.border}`}>
                                                                <Icon className={`w-4 h-4 ${style.color}`} />
                                                            </div>
                                                            <div className="font-medium text-white">{tx.merchant}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-slate-400">{tx.category}</td>
                                                    <td className="px-6 py-3 text-slate-400 text-xs">
                                                        {new Date(tx.date).toLocaleDateString('en-GB')}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono text-white group-hover:text-rose-400 transition-colors">
                                                        -{Math.abs(tx.amount).toLocaleString()} ₪
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {topExpenses.length === 0 && (
                                            <tr><td colSpan={4} className="px-6 py-8 text-center text-muted">No expenses found in this period.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}


                {/* TAB CONTENT: ASSETS */}
                {activeTab === 'assets' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-10">
                        {/* Placeholder for future Area Chart */}
                        <div className="card p-10 flex flex-col items-center justify-center border-dashed border-2 border-slate-700 bg-transparent">
                            <div className="p-4 bg-slate-800 rounded-full mb-4">
                                <Wallet className="w-8 h-8 text-cyan-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Net Worth Analytics</h3>
                            <p className="text-slate-400 max-w-md mx-auto mt-2">
                                Detailed history and asset allocation charts are coming in the next update.
                                <br />
                                For now, view your accounts list below.
                            </p>
                            <button
                                onClick={() => router.push('/accounts')}
                                className="mt-6 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
                            >
                                Manage Accounts
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                            <div className="card p-6">
                                <h3 className="font-bold text-white mb-4">Asset Allocation</h3>
                                <div className="space-y-3">
                                    {assetStats && Object.entries(assetStats.byType).map(([type, count]) => (
                                        <div key={type} className="flex justify-between p-3 rounded bg-white/5 border border-white/5">
                                            <span className="capitalize text-slate-300">{type}</span>
                                            <span className="font-mono text-white">{count} Accounts</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="card p-6">
                                <h3 className="font-bold text-white mb-4">Currency Exposure</h3>
                                <div className="space-y-3">
                                    {assetStats && Object.entries(assetStats.byCurrency).map(([curr, val]) => (
                                        <div key={curr} className="flex justify-between p-3 rounded bg-white/5 border border-white/5">
                                            <span className="text-slate-300">{curr}</span>
                                            {/* Note: Value is raw sum, not normalized. Just showing presence for now */}
                                            <span className="font-mono text-white flex items-center gap-2">
                                                Active
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <AIChatSidebar />
        </AppShell>
    );
}

// Re-using TransactionList and others...
