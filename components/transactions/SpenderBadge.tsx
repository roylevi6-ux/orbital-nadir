'use client';

import { useState, useEffect } from 'react';
import { Spender, SpenderConfig, getSpenderConfig } from '@/app/actions/spender-detection';

interface SpenderBadgeProps {
    spender: Spender | null | undefined;
    size?: 'sm' | 'md' | 'lg';
    showName?: boolean;
}

// Cache spender config to avoid refetching for each badge
let spenderConfigCache: SpenderConfig[] | null = null;
let cachePromise: Promise<SpenderConfig[]> | null = null;

async function getCachedSpenderConfig(): Promise<SpenderConfig[]> {
    if (spenderConfigCache) return spenderConfigCache;
    if (cachePromise) return cachePromise;

    cachePromise = (async () => {
        const result = await getSpenderConfig();
        if (result.success && result.data) {
            spenderConfigCache = result.data as SpenderConfig[];
            return spenderConfigCache;
        }
        return [];
    })();

    return cachePromise;
}

export default function SpenderBadge({ spender, size = 'sm', showName = false }: SpenderBadgeProps) {
    const [config, setConfig] = useState<SpenderConfig | null>(null);

    useEffect(() => {
        if (!spender) return;

        getCachedSpenderConfig().then(configs => {
            const found = configs.find(c => c.spender_key === spender);
            if (found) setConfig(found);
        });
    }, [spender]);

    if (!spender) {
        return (
            <span className="text-[var(--text-muted)] text-xs">—</span>
        );
    }

    const sizeClasses = {
        sm: 'w-6 h-6 text-xs',
        md: 'w-8 h-8 text-sm',
        lg: 'w-10 h-10 text-base'
    };

    const displayName = config?.display_name || spender;
    const color = config?.color || (spender === 'R' ? '#3B82F6' : '#EC4899');

    return (
        <div className="flex items-center gap-1.5">
            <div
                className={`
                    ${sizeClasses[size]}
                    rounded-full flex items-center justify-center
                    font-bold transition-transform hover:scale-110
                `}
                style={{
                    backgroundColor: `${color}30`,
                    color: color,
                    border: `2px solid ${color}50`
                }}
                title={displayName}
            >
                {displayName.charAt(0).toUpperCase()}
            </div>
            {showName && (
                <span
                    className="text-sm font-medium"
                    style={{ color }}
                >
                    {displayName}
                </span>
            )}
        </div>
    );
}

/**
 * Spender filter component for filtering transactions by spender
 */
interface SpenderFilterProps {
    value: Spender | 'all';
    onChange: (value: Spender | 'all') => void;
}

export function SpenderFilter({ value, onChange }: SpenderFilterProps) {
    const [spenders, setSpenders] = useState<SpenderConfig[]>([]);

    useEffect(() => {
        getCachedSpenderConfig().then(setSpenders);
    }, []);

    return (
        <div className="flex items-center gap-1">
            <button
                onClick={() => onChange('all')}
                className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${value === 'all'
                        ? 'bg-[var(--neon-purple)]/20 text-[var(--neon-purple)] border border-[var(--neon-purple)]/40'
                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-glass)] hover:border-[var(--neon-purple)]/40'
                    }
                `}
            >
                All
            </button>
            {spenders.map(sp => (
                <button
                    key={sp.spender_key}
                    onClick={() => onChange(sp.spender_key as Spender)}
                    className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5
                        ${value === sp.spender_key
                            ? 'border-2'
                            : 'bg-[var(--bg-card)] border border-[var(--border-glass)] hover:border-opacity-60'
                        }
                    `}
                    style={{
                        backgroundColor: value === sp.spender_key ? `${sp.color}20` : undefined,
                        color: value === sp.spender_key ? sp.color : 'var(--text-muted)',
                        borderColor: value === sp.spender_key ? sp.color : undefined
                    }}
                >
                    <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{
                            backgroundColor: `${sp.color}30`,
                            color: sp.color
                        }}
                    >
                        {sp.display_name.charAt(0)}
                    </span>
                    {sp.display_name}
                </button>
            ))}
        </div>
    );
}
