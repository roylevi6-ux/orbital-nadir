'use client';

import { useState, useEffect } from 'react';
import { updateSingleTransactionStatus } from '@/app/actions/bulk-status-update';
import { toast } from 'sonner';

type TransactionStatus = 'verified' | 'verified_by_ai' | 'pending';

interface StatusBadgeProps {
    status: string;
    txId: string;
    onOptimisticUpdate: (id: string, newStatus: string) => void;
}

const STATUS_CONFIG: Record<TransactionStatus, { label: string; color: string }> = {
    verified: { label: '✅ Verified', color: 'var(--neon-green)' },
    verified_by_ai: { label: '🤖 AI Verified', color: 'var(--neon-blue)' },
    pending: { label: '⏳ Pending', color: 'var(--neon-warning)' },
};

export default function StatusBadge({ status, txId, onOptimisticUpdate }: StatusBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [localStatus, setLocalStatus] = useState(status);

    // Sync with prop changes
    useEffect(() => {
        setLocalStatus(status);
    }, [status]);

    const handleStatusChange = async (newStatus: TransactionStatus) => {
        // Optimistic update - change UI immediately
        setLocalStatus(newStatus);
        setIsOpen(false);
        onOptimisticUpdate(txId, newStatus);

        // Sync in background (no await, no blocking)
        updateSingleTransactionStatus(txId, newStatus).then(result => {
            if (!result.success) {
                // Revert on error
                setLocalStatus(status);
                toast.error('Failed to update status');
            }
        });
    };

    const config = STATUS_CONFIG[localStatus as TransactionStatus] ?? STATUS_CONFIG.pending;

    return (
        <div className="relative inline-block">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border cursor-pointer transition-all hover:scale-105"
                style={{
                    backgroundColor: `${config.color}20`,
                    color: config.color,
                    borderColor: `${config.color}40`
                }}
            >
                {config.label}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute z-50 mt-1 left-0 w-36 bg-[var(--bg-primary)] border border-[var(--border-neon)] rounded-lg shadow-xl overflow-hidden">
                        {(Object.keys(STATUS_CONFIG) as TransactionStatus[]).map((statusKey) => (
                            <button
                                key={statusKey}
                                onClick={() => handleStatusChange(statusKey)}
                                className="w-full px-3 py-2 text-left text-xs transition-colors"
                                style={{
                                    color: STATUS_CONFIG[statusKey].color,
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${STATUS_CONFIG[statusKey].color}20`}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {STATUS_CONFIG[statusKey].label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
