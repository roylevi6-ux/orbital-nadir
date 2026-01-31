'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/auth/supabase';
import { getTransactions, Transaction } from '@/app/actions/get-transactions';
import { getCategoryNames, approveTransaction } from '@/app/actions/review-transaction';
import { deleteTransaction } from '@/app/actions/delete-transaction';
import TransactionTable from '@/components/transactions/TransactionTable';
import AddTransactionButton from '@/components/transactions/AddTransactionButton';
import NavReconciliationBadge from '@/components/dashboard/NavReconciliationBadge';
import CategorizeButton from '@/components/dashboard/CategorizeButton';
import CleanupButton from '@/components/dashboard/CleanupButton';
import SalaryWidget from '@/components/dashboard/SalaryWidget';
import { transactionsToCSV, downloadCSV, generateExportFilename } from '@/lib/export/csv-generator';
import AppShell from '@/components/layout/AppShell';
import { toast } from 'sonner';

export default function TransactionsPage() {
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [reviewCount, setReviewCount] = useState(0); // New state for true count
    const [filter, setFilter] = useState<'all' | 'review' | 'verified'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const router = useRouter();
    const supabase = createClient();

    // Data Fetcher - memoized to prevent unnecessary re-renders
    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);

        // Import count action dynamically or statically
        const { getReviewCount } = await import('@/app/actions/get-review-count');

        const [txRes, expRes, incRes, countRes] = await Promise.all([
            getTransactions(filter),
            getCategoryNames('expense'),
            getCategoryNames('income'),
            getReviewCount()
        ]);

        if (txRes.success) setTransactions(txRes.data);
        if (expRes) setExpenseCategories(expRes);
        if (incRes) setIncomeCategories(incRes);
        setReviewCount(countRes); // Set true count

        if (!silent) setLoading(false);
    }, [filter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    // Memoized delete handler to prevent TransactionRow re-renders
    const handleDelete = useCallback(async (transactionId: string) => {
        const result = await deleteTransaction(transactionId);
        if (result.success) {
            await fetchData(true); // Refresh the list silently
        } else {
            toast.error('Failed to delete transaction: ' + result.error);
        }
    }, [fetchData]);

    // Memoized refresh handler for child components
    const handleRefresh = useCallback(() => fetchData(true), [fetchData]);

    // Filter transactions by search query
    const filteredTransactions = useMemo(() => {
        if (!searchQuery.trim()) return transactions;

        const query = searchQuery.toLowerCase();
        return transactions.filter(tx => {
            return (
                tx.merchant_raw.toLowerCase().includes(query) ||
                tx.merchant_normalized?.toLowerCase().includes(query) ||
                tx.category?.toLowerCase().includes(query) ||
                tx.notes?.toLowerCase().includes(query) ||
                tx.amount.toString().includes(query)
            );
        });
    }, [transactions, searchQuery]);

    const handleExportCSV = () => {
        if (filteredTransactions.length === 0) {
            toast.warning('No transactions to export');
            return;
        }

        const csv = transactionsToCSV(filteredTransactions);
        const filename = generateExportFilename(`transactions_${filter}`, 'csv');
        downloadCSV(csv, filename);
    };

    return (
        <AppShell>
            <main className="max-w-[1600px] mx-auto px-6 py-8 animate-in text-white relative">
                {/* Decorative background gradients */}
                <div className="fixed top-0 left-0 w-full h-[500px] bg-violet-900/10 blur-[120px] pointer-events-none -z-10" />
                <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-indigo-900/10 blur-[100px] pointer-events-none -z-10" />

                {/* Visual Header & Filters */}
                <div className="flex flex-col xl:flex-row justify-between items-end mb-8 gap-6">
                    <div>
                        <h2 className="text-4xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight">Transactions</h2>
                        <p className="text-[var(--text-muted)] mt-2 text-lg">Manage your spending and verify records.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                        {/* Filter Tabs */}
                        <div className="flex bg-slate-900/60 backdrop-blur-md rounded-xl p-1 shadow-lg border border-white/10 flex-1 sm:flex-none justify-center">
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all ${filter === 'all' ? 'bg-violet-500/20 text-violet-200 border border-violet-500/20 shadow-sm' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-card)]'}`}
                            >
                                All View
                            </button>
                            <button
                                onClick={() => setFilter('review')}
                                className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${filter === 'review' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/20 shadow-sm' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-card)]'}`}
                            >
                                Pending
                                {reviewCount > 0 && (
                                    <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-amber-950 tabular-nums">
                                        {reviewCount}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setFilter('verified')}
                                className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${filter === 'verified' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/20 shadow-sm' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-card)]'}`}
                            >
                                Verified <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded-full text-emerald-400">✓</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-end gap-3 mb-6">
                    <SalaryWidget onSuccess={handleRefresh} />
                    <div className="h-8 w-px bg-white/10 mx-1 hidden md:block"></div>
                    <CategorizeButton onSuccess={handleRefresh} />
                    <div className="h-8 w-px bg-white/10 mx-1 hidden md:block"></div>
                    <CleanupButton onSuccess={handleRefresh} />
                </div>

                {/* Table Area */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {loading ? (
                        <div className="holo-card p-20 text-center bg-slate-900/40 backdrop-blur-xl border border-[var(--border-glass)]">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500 mx-auto mb-6"></div>
                            <p className="text-[var(--text-muted)] text-lg">Loading your financial data...</p>
                        </div>
                    ) : (
                        <TransactionTable
                            transactions={filteredTransactions}
                            incomeCategories={incomeCategories}
                            expenseCategories={expenseCategories}
                            onRefresh={handleRefresh}
                            onDelete={handleDelete}
                        />
                    )}
                </div>

                {/* Floating Add Button */}
                <AddTransactionButton onSuccess={handleRefresh} />
            </main>
        </AppShell>
    );
}
