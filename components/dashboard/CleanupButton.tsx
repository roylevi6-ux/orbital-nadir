'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReconciliationResolver from './ReconciliationResolver';
import { getPendingReconciliationCount } from '@/app/actions/p2p-reconciliation';

interface Props {
    onSuccess?: () => void;
}

export default function CleanupButton({ onSuccess }: Props) {
    const [isResolverOpen, setIsResolverOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [pendingCount, setPendingCount] = useState<number>(0);
    const router = useRouter();

    // Load pending count on mount
    useEffect(() => {
        loadPendingCount();
    }, []);

    const loadPendingCount = async () => {
        try {
            const counts = await getPendingReconciliationCount();
            setPendingCount(counts.total);
        } catch (e) {
            console.error('Failed to load pending count:', e);
        }
    };

    const handleReconcileClick = () => {
        setIsResolverOpen(true);
    };

    const handleComplete = () => {
        router.refresh();
        loadPendingCount(); // Refresh count after reconciliation
        if (onSuccess) onSuccess();
        setMessage('Reconciliation complete!');
        setTimeout(() => setMessage(null), 3000);
    };

    const handleDeleteAll = async () => {
        if (!confirm('⚠️ DANGER: This will delete ALL transactions for your household.\n\nType "delete" to confirm.')) {
            return;
        }
        if (!confirm('Are you ABSOLUTELY sure? This cannot be undone.')) return;

        setLoading(true);
        setMessage(null);

        try {
            const { deleteAllTransactions } = await import('@/app/actions/cleanup-data');
            const result = await deleteAllTransactions();
            setMessage(`Deleted ${result.count} transactions.`);
            router.refresh();
            loadPendingCount(); // Refresh count after deletion
            if (onSuccess) onSuccess();
        } catch (error: unknown) {
            console.error(error);
            setMessage('Failed to delete data: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setLoading(false);
            setTimeout(() => setMessage(null), 5000);
        }
    };

    return (
        <>
            <div className="flex items-center gap-4">
                <button
                    onClick={handleReconcileClick}
                    className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-medium rounded-lg transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] border border-cyan-500/20 hover:border-cyan-500/40 flex items-center gap-2 relative"
                >
                    <span>🔄</span> Reconcile Payments
                    {pendingCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                            {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                    )}
                </button>

                <button
                    onClick={handleDeleteAll}
                    disabled={loading}
                    className="px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 font-medium rounded-lg transition-all hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] border border-violet-500/20 hover:border-violet-500/40 flex items-center gap-2 disabled:opacity-50"
                >
                    {loading ? 'Deleting...' : (
                        <>
                            <span>🗑️</span> Delete All
                        </>
                    )}
                </button>

                {message && (
                    <span className="text-sm font-medium text-emerald-300 animate-fade-in">
                        {message}
                    </span>
                )}
            </div>

            <ReconciliationResolver
                isOpen={isResolverOpen}
                onClose={() => setIsResolverOpen(false)}
                onComplete={handleComplete}
            />
        </>
    );
}
