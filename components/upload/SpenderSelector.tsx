'use client';

import { useState, useEffect } from 'react';
import type { Spender, SpenderConfig } from '@/lib/spender-utils';
import { getSpenderConfig, saveCardMapping } from '@/app/actions/spender-detection';

interface SpenderSelectorProps {
    /** Detected card ending (if auto-detected from file) */
    detectedCardEnding?: string | null;
    /** Pre-selected spender (if auto-detected) */
    autoDetectedSpender?: Spender | null;
    /** Callback when spender is selected */
    onSpenderSelected: (spender: Spender) => void;
    /** Callback when user wants to save the card mapping */
    onSaveMapping?: (cardEnding: string, spender: Spender) => void;
    /** Whether selection is required to continue */
    required?: boolean;
    /** Number of transactions found */
    transactionCount?: number;
    /** Source filename */
    filename?: string;
}

export default function SpenderSelector({
    detectedCardEnding,
    autoDetectedSpender,
    onSpenderSelected,
    onSaveMapping,
    required = true,
    transactionCount = 0,
    filename = ''
}: SpenderSelectorProps) {
    const [spenders, setSpenders] = useState<SpenderConfig[]>([]);
    const [selectedSpender, setSelectedSpender] = useState<Spender | null>(autoDetectedSpender || null);
    const [rememberMapping, setRememberMapping] = useState(false);
    const [loading, setLoading] = useState(true);

    // Load spender configuration
    useEffect(() => {
        async function loadSpenders() {
            const result = await getSpenderConfig();
            if (result.success && result.data) {
                setSpenders(result.data as SpenderConfig[]);
            }
            setLoading(false);
        }
        loadSpenders();
    }, []);

    // Set auto-detected spender
    useEffect(() => {
        if (autoDetectedSpender) {
            setSelectedSpender(autoDetectedSpender);
        }
    }, [autoDetectedSpender]);

    const handleSelect = (spender: Spender) => {
        setSelectedSpender(spender);
        onSpenderSelected(spender);
    };

    const handleContinue = async () => {
        if (!selectedSpender) return;

        // Save mapping if requested
        if (rememberMapping && detectedCardEnding && onSaveMapping) {
            onSaveMapping(detectedCardEnding, selectedSpender);
            // Also save to database
            await saveCardMapping(detectedCardEnding, selectedSpender);
        }

        onSpenderSelected(selectedSpender);
    };

    if (loading) {
        return (
            <div className="animate-pulse bg-[var(--bg-secondary)] rounded-lg p-6">
                <div className="h-6 bg-[var(--bg-tertiary)] rounded w-1/3 mb-4" />
                <div className="h-12 bg-[var(--bg-tertiary)] rounded" />
            </div>
        );
    }

    // Auto-detected view (no blocking needed)
    if (autoDetectedSpender && detectedCardEnding) {
        const spenderInfo = spenders.find(s => s.spender_key === autoDetectedSpender);

        return (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-[var(--text-secondary)]">
                        {filename && <span className="mr-2">📄 {filename}</span>}
                        {transactionCount > 0 && <span>📊 {transactionCount} transactions</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2 text-[var(--neon-green)]">
                    <span className="text-lg">✅</span>
                    <span className="font-medium">
                        Detected: Card *{detectedCardEnding} →{' '}
                        <span style={{ color: spenderInfo?.color || 'var(--text-primary)' }}>
                            {spenderInfo?.display_name || autoDetectedSpender}
                        </span>
                    </span>
                </div>

                <div className="mt-4 flex gap-3">
                    <button
                        onClick={() => setSelectedSpender(null)}
                        className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        Change
                    </button>
                </div>
            </div>
        );
    }

    // Manual selection view (blocks upload until selected)
    return (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-warning)] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-[var(--text-secondary)]">
                    {filename && <span className="mr-2">📄 {filename}</span>}
                    {transactionCount > 0 && <span>📊 {transactionCount} transactions</span>}
                </div>
            </div>

            {required && (
                <div className="flex items-center gap-2 text-[var(--neon-warning)] mb-4">
                    <span className="text-lg">⚠️</span>
                    <span className="font-medium">Could not detect card holder</span>
                </div>
            )}

            <p className="text-[var(--text-primary)] font-medium mb-4">
                Who made these transactions?
            </p>

            <div className="flex gap-4 mb-6">
                {spenders.map((spender) => (
                    <button
                        key={spender.spender_key}
                        onClick={() => handleSelect(spender.spender_key as Spender)}
                        className={`
                            flex-1 py-4 px-6 rounded-lg border-2 transition-all
                            flex flex-col items-center gap-2
                            ${selectedSpender === spender.spender_key
                                ? 'border-[var(--neon-blue)] bg-[var(--neon-blue)]/10'
                                : 'border-[var(--border-primary)] hover:border-[var(--border-neon)]'
                            }
                        `}
                        style={{
                            borderColor: selectedSpender === spender.spender_key ? spender.color : undefined
                        }}
                    >
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
                            style={{ backgroundColor: `${spender.color}30`, color: spender.color }}
                        >
                            {spender.display_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[var(--text-primary)] font-medium">
                            {spender.display_name}
                        </span>
                    </button>
                ))}
            </div>

            {/* Remember mapping option */}
            {detectedCardEnding && (
                <div className="border-t border-[var(--border-primary)] pt-4 mb-6">
                    <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rememberMapping}
                            onChange={(e) => setRememberMapping(e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--border-primary)] bg-[var(--bg-tertiary)]"
                        />
                        <span>
                            💡 Remember: Card ending <strong>{detectedCardEnding}</strong> always belongs to{' '}
                            {selectedSpender ? (
                                <strong style={{ color: spenders.find(s => s.spender_key === selectedSpender)?.color }}>
                                    {spenders.find(s => s.spender_key === selectedSpender)?.display_name}
                                </strong>
                            ) : (
                                'selected person'
                            )}
                        </span>
                    </label>
                </div>
            )}

            <div className="flex justify-end gap-3">
                <button
                    onClick={handleContinue}
                    disabled={required && !selectedSpender}
                    className={`
                        px-6 py-2 rounded-lg font-medium transition-all
                        ${selectedSpender
                            ? 'bg-[var(--neon-blue)] text-white hover:bg-[var(--neon-blue)]/80'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                        }
                    `}
                >
                    Continue →
                </button>
            </div>
        </div>
    );
}
