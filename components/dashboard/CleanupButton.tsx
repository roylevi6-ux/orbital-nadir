'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DuplicateResolver from './DuplicateResolver';

interface Props {
    onSuccess?: () => void;
}

export default function CleanupButton({ onSuccess }: Props) {
    const [isResolverOpen, setIsResolverOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const router = useRouter();

    const handleCleanupClick = () => {
        setIsResolverOpen(true);
    };

    const handleComplete = () => {
        router.refresh();
        if (onSuccess) onSuccess();
        setMessage('Cleanup complete!');
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
            if (onSuccess) onSuccess();
        } catch (error: any) {
            console.error(error);
            setMessage('Failed to delete data: ' + error.message);
        } finally {
            setLoading(false);
            setTimeout(() => setMessage(null), 5000);
        }
    };

    return (
        <>
            <div className="flex items-center gap-4">
                <button
                    onClick={handleCleanupClick}
                    className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-medium rounded-lg transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] border border-cyan-500/20 hover:border-cyan-500/40 flex items-center gap-2"
                >
                    <span>🧹</span> Resolve Duplicates
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

            <DuplicateResolver
                isOpen={isResolverOpen}
                onClose={() => setIsResolverOpen(false)}
                onComplete={handleComplete}
            />
        </>
    );
}
