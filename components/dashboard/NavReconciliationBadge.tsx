'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUnreconciledCount } from '@/app/actions/get-unreconciled-count';

export default function NavReconciliationBadge() {
    const router = useRouter();
    const [count, setCount] = useState(0);

    useEffect(() => {
        const fetchCount = async () => {
            const c = await getUnreconciledCount();
            setCount(c);
        };
        fetchCount();

        // Optional: Poll every 30s or listen to realtime changes
        // For MVP, fetch on mount is enough.
    }, []);

    return (
        <button
            onClick={() => router.push('/reconciliation')}
            className="relative px-4 py-1.5 text-sm font-medium text-muted hover:text-white rounded-md hover:bg-white/10 transition-all"
        >
            Reconciliation
            {count > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-lg shadow-rose-500/50 animate-in zoom-in-50">
                    {count > 9 ? '9+' : count}
                </span>
            )}
        </button>
    );
}
