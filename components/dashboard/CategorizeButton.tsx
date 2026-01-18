'use client';

import { useState } from 'react';
import { aiCategorizeTransactions } from '@/app/actions/ai-categorize';
import { useRouter } from 'next/navigation';

interface Props {
    onSuccess?: () => void;
}

export default function CategorizeButton({ onSuccess }: Props) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const router = useRouter();

    const handleCategorize = async () => {
        setLoading(true);
        setMessage(null);

        try {
            // Recursive function to drain the queue
            const processBatch = async (totalProcessed = 0): Promise<void> => {
                const result = await aiCategorizeTransactions();

                if (result.error) {
                    setMessage(`Error: ${result.error}`);
                    setLoading(false);
                    return;
                }

                const batchCount = result.count;

                // Stop conditions:
                // 1. No more pending transactions
                // 2. This batch processed 0 items (nothing left to do)
                if (result.details?.includes('No pending') || batchCount === 0) {
                    if (totalProcessed > 0) {
                        setMessage(`Done! Processed ${totalProcessed} transactions.`);
                        router.refresh();
                        if (onSuccess) onSuccess();
                    } else {
                        // Show error details if available
                        const errorInfo = result.error ? ` (${result.error})` : '';
                        setMessage(`No pending transactions.${errorInfo}`);
                    }
                    setLoading(false);
                    return;
                }

                // Update UI progress
                const newTotal = totalProcessed + batchCount;
                setMessage(`Processing... (${newTotal} categorized so far)`);

                // Continue to next batch
                await processBatch(newTotal);
            };

            await processBatch();

        } catch (error) {
            console.error(error);
            setMessage('Failed to categorize.');
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <button
                onClick={handleCategorize}
                disabled={loading}
                className="px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 font-medium rounded-lg transition-all hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] border border-violet-500/20 hover:border-violet-500/40 flex items-center gap-2 disabled:opacity-50"
            >
                {loading ? 'Thinking...' : (
                    <>
                        <span>🤖</span> Auto-Categorize
                    </>
                )}
            </button>
            {message && (
                <span className="text-sm font-medium text-purple-300 animate-fade-in">
                    {message}
                </span>
            )}
        </div>
    );
}
