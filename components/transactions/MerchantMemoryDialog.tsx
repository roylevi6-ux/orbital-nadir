'use client';

import { useState } from 'react';
import { Brain, Check, X, RefreshCw } from 'lucide-react';

export type MemorizeChoice = 'none' | 'remember' | 'current_only' | 'all_past' | 'future_only';

interface MerchantMemoryDialogProps {
    isOpen: boolean;
    onClose: () => void;
    merchantName: string;
    newCategory: string;
    isMemorized: boolean;
    currentMemorizedCategory?: string;
    onConfirm: (choice: MemorizeChoice) => void;
}

export default function MerchantMemoryDialog({
    isOpen,
    onClose,
    merchantName,
    newCategory,
    isMemorized,
    currentMemorizedCategory,
    onConfirm
}: MerchantMemoryDialogProps) {
    const [selectedChoice, setSelectedChoice] = useState<MemorizeChoice>(
        isMemorized ? 'current_only' : 'none'
    );

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(selectedChoice);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-md mx-4 bg-[var(--bg-card)] border border-white/10 rounded-2xl shadow-2xl shadow-black/40 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
                    <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">
                            {isMemorized ? 'Update Merchant Category' : 'Remember This Merchant?'}
                        </h3>
                        <p className="text-sm text-muted truncate max-w-[280px]">
                            {merchantName}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                    {isMemorized ? (
                        // Scenario B: Changing a memorized merchant
                        <>
                            <div className="text-sm text-muted mb-4">
                                <span className="text-white font-medium">{merchantName}</span> is currently set to{' '}
                                <span className="text-violet-400">{currentMemorizedCategory}</span>.
                                You&apos;re changing it to{' '}
                                <span className="text-emerald-400">{newCategory}</span>.
                            </div>

                            <div className="space-y-2">
                                <label className="flex items-start gap-3 p-3 rounded-lg border border-white/10 hover:border-white/20 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        name="choice"
                                        checked={selectedChoice === 'current_only'}
                                        onChange={() => setSelectedChoice('current_only')}
                                        className="mt-0.5 accent-violet-500"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Change only this transaction</div>
                                        <div className="text-xs text-muted">Keep memory as-is for future transactions</div>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-white/10 hover:border-white/20 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        name="choice"
                                        checked={selectedChoice === 'all_past'}
                                        onChange={() => setSelectedChoice('all_past')}
                                        className="mt-0.5 accent-violet-500"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Change all past entries</div>
                                        <div className="text-xs text-muted">Update all &ldquo;{merchantName}&rdquo; transactions AND future ones</div>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-white/10 hover:border-white/20 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        name="choice"
                                        checked={selectedChoice === 'future_only'}
                                        onChange={() => setSelectedChoice('future_only')}
                                        className="mt-0.5 accent-violet-500"
                                    />
                                    <div>
                                        <div className="font-medium text-white">Change this + future entries</div>
                                        <div className="text-xs text-muted">Update memory, keep past entries as-is</div>
                                    </div>
                                </label>
                            </div>
                        </>
                    ) : (
                        // Scenario A: First-time categorization
                        <>
                            <div className="text-sm text-muted mb-4">
                                Categorize all future transactions from{' '}
                                <span className="text-white font-medium">&ldquo;{merchantName}&rdquo;</span> as{' '}
                                <span className="text-emerald-400">{newCategory}</span>?
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        onConfirm('none');
                                        onClose();
                                    }}
                                    className="flex-1 px-4 py-3 rounded-lg border border-white/10 hover:border-white/20 text-muted hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4 mx-auto mb-1" />
                                    <div className="text-sm font-medium">No, just this one</div>
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm('remember');
                                        onClose();
                                    }}
                                    className="flex-1 px-4 py-3 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors"
                                >
                                    <Brain className="w-4 h-4 mx-auto mb-1" />
                                    <div className="text-sm font-medium">Yes, remember</div>
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer (only for memorized scenario) */}
                {isMemorized && (
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-muted hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <Check className="w-4 h-4" />
                            Apply
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
