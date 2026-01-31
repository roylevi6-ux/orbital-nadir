'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Transaction } from '@/app/actions/get-transactions';
import {
    getTransactionSources,
    TransactionSource,
    SmsSource,
    EmailReceiptSource,
    CcSlipSource
} from '@/app/actions/get-transaction-sources';
import SpenderBadge from './SpenderBadge';

interface TransactionDetailProps {
    transaction: Transaction;
    onClose: () => void;
}

export default function TransactionDetail({ transaction, onClose }: TransactionDetailProps) {
    const [sources, setSources] = useState<TransactionSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSource, setExpandedSource] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    // Mount portal only on client side
    useEffect(() => {
        setMounted(true);
    }, []);

    // Handle escape key and body scroll
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    useEffect(() => {
        async function loadSources() {
            if (!transaction.id) return;

            const result = await getTransactionSources(transaction.id);
            if (result.success && result.data) {
                setSources(result.data.sources);
            }
            setLoading(false);
        }

        loadSources();
    }, [transaction.id]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (amount: number, currency = 'ILS') => {
        return new Intl.NumberFormat('he-IL', {
            style: 'currency',
            currency
        }).format(amount);
    };

    const getProviderName = (provider: string | null) => {
        const names: Record<string, string> = {
            isracard: 'Isracard',
            cal: 'Visa Cal',
            max: 'Max',
            leumi: 'Leumi Card',
            unknown: 'Unknown'
        };
        return names[provider || 'unknown'] || provider || 'Unknown';
    };

    const renderSmsSource = (source: SmsSource) => (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-[var(--text-muted)]">Provider:</span>
                    <span className="ml-2 text-[var(--text-primary)]">{getProviderName(source.provider)}</span>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Card:</span>
                    <span className="ml-2 text-[var(--text-primary)]">****{source.card_ending}</span>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Amount:</span>
                    <span className="ml-2 text-[var(--text-primary)]">{formatCurrency(source.amount)}</span>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Merchant:</span>
                    <span className="ml-2 text-[var(--text-primary)]">{source.merchant_name || '—'}</span>
                </div>
            </div>

            {expandedSource === source.id && (
                <div className="mt-3 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-glass)]">
                    <p className="text-xs text-[var(--text-muted)] mb-1">Raw Message:</p>
                    <p className="text-sm text-[var(--text-secondary)] font-mono whitespace-pre-wrap" dir="rtl">
                        {source.raw_message}
                    </p>
                </div>
            )}

            <button
                onClick={() => setExpandedSource(expandedSource === source.id ? null : source.id)}
                className="text-xs text-[var(--neon-blue)] hover:underline"
            >
                {expandedSource === source.id ? 'Hide raw message' : 'Show raw message'}
            </button>
        </div>
    );

    const renderEmailReceiptSource = (source: EmailReceiptSource) => {
        // Parse items array - each item has {name, quantity?, price?}
        const items = source.items as Array<{ name: string; quantity?: number; price?: number }> | null;

        return (
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-[var(--text-muted)]">From:</span>
                        <span className="ml-2 text-[var(--text-primary)]">{source.sender_email || '—'}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">Subject:</span>
                        <span className="ml-2 text-[var(--text-primary)]">{source.raw_subject || '—'}</span>
                    </div>
                    {source.amount && (
                        <div>
                            <span className="text-[var(--text-muted)]">Amount:</span>
                            <span className="ml-2 text-[var(--text-primary)]">{formatCurrency(source.amount)}</span>
                        </div>
                    )}
                    {source.merchant_name && (
                        <div>
                            <span className="text-[var(--text-muted)]">Merchant:</span>
                            <span className="ml-2 text-[var(--text-primary)]">{source.merchant_name}</span>
                        </div>
                    )}
                </div>

                {items && items.length > 0 && (
                    <div className="mt-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Extracted Items:</p>
                        <ul className="list-disc list-inside text-sm text-[var(--text-secondary)]">
                            {items.map((item, i) => (
                                <li key={i}>
                                    {item.name}
                                    {item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}
                                    {item.price ? ` (${formatCurrency(item.price)})` : ''}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    const renderCcSlipSource = (source: CcSlipSource) => (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-[var(--text-muted)]">File:</span>
                    <span className="ml-2 text-[var(--text-primary)]">{source.source_file}</span>
                </div>
                {source.source_row && (
                    <div>
                        <span className="text-[var(--text-muted)]">Row:</span>
                        <span className="ml-2 text-[var(--text-primary)]">Line {source.source_row}</span>
                    </div>
                )}
            </div>
        </div>
    );

    const getSourceIcon = (type: string) => {
        switch (type) {
            case 'sms': return '📱';
            case 'email_receipt': return '📧';
            case 'cc_slip': return '📄';
            default: return '📋';
        }
    };

    const getSourceTitle = (source: TransactionSource) => {
        switch (source.type) {
            case 'sms':
                return `SMS (${source.cc_matched ? 'Confirmed' : 'Primary'})`;
            case 'email_receipt':
                return source.source_type === 'sms' ? 'SMS Receipt' : 'Email Receipt';
            case 'cc_slip':
                return 'CC Slip (Confirmed)';
            default:
                return 'Source';
        }
    };

    const getSourceDate = (source: TransactionSource) => {
        switch (source.type) {
            case 'sms':
                return formatDateTime(source.received_at);
            case 'email_receipt':
                return formatDateTime(source.created_at);
            case 'cc_slip':
                return source.transaction_date ? formatDate(source.transaction_date) : '—';
            default:
                return '';
        }
    };

    // Don't render until mounted (client-side only for portal)
    if (!mounted) return null;

    const modalContent = (
        <div
            ref={modalRef}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[var(--bg-card)] border border-[var(--border-glass)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-glass)]">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">💳</span>
                        <h2 className="text-lg font-bold text-white">Transaction Details</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-[var(--text-muted)] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 85px)' }}>
                    {/* Main Transaction Info */}
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-glass)] rounded-lg p-5 mb-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Amount</p>
                                <p className={`text-xl font-bold ${transaction.type === 'income' ? 'text-[var(--neon-green)]' : 'text-white'}`}>
                                    {transaction.type === 'income' ? '+' : ''}{formatCurrency(transaction.amount, transaction.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Date</p>
                                <p className="text-lg text-white">{formatDate(transaction.date)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Merchant</p>
                                <p className="text-white">{transaction.merchant_normalized || transaction.merchant_raw}</p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Category</p>
                                <p className="text-white">{transaction.category || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Who</p>
                                <SpenderBadge spender={transaction.spender} size="md" showName />
                            </div>
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Status</p>
                                <span className={`
                                    inline-block px-2 py-0.5 rounded text-xs font-medium
                                    ${transaction.status === 'verified' ? 'bg-[var(--neon-green)]/20 text-[var(--neon-green)]' :
                                        transaction.status === 'categorized' ? 'bg-[var(--neon-blue)]/20 text-[var(--neon-blue)]' :
                                            transaction.status === 'flagged' ? 'bg-[var(--neon-warning)]/20 text-[var(--neon-warning)]' :
                                                'bg-white/10 text-[var(--text-muted)]'
                                    }
                                `}>
                                    {transaction.status}
                                </span>
                            </div>
                        </div>

                        {transaction.notes && (
                            <div className="mt-4 pt-4 border-t border-[var(--border-glass)]">
                                <p className="text-xs text-[var(--text-muted)] mb-1">Notes</p>
                                <p className="text-sm text-[var(--text-secondary)]">{transaction.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Data Sources */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">📊</span>
                            <h3 className="font-bold text-white">Data Sources ({sources.length})</h3>
                        </div>

                        {loading ? (
                            <div className="animate-pulse space-y-3">
                                <div className="h-20 bg-[var(--bg-secondary)] rounded-lg" />
                                <div className="h-20 bg-[var(--bg-secondary)] rounded-lg" />
                            </div>
                        ) : sources.length === 0 ? (
                            <p className="text-sm text-[var(--text-muted)] py-4">
                                No linked sources found for this transaction.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {sources.map((source, index) => (
                                    <div
                                        key={source.type === 'cc_slip' ? `cc-${index}` : (source as SmsSource | EmailReceiptSource).id}
                                        className="bg-[var(--bg-secondary)] border border-[var(--border-glass)] rounded-lg overflow-hidden"
                                    >
                                        {/* Source Header */}
                                        <div className="flex items-center justify-between p-4 border-b border-[var(--border-glass)]">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{getSourceIcon(source.type)}</span>
                                                <span className="font-medium text-white">{getSourceTitle(source)}</span>
                                            </div>
                                            <span className="text-xs text-[var(--text-muted)]">{getSourceDate(source)}</span>
                                        </div>

                                        {/* Source Content */}
                                        <div className="p-4">
                                            {source.type === 'sms' && renderSmsSource(source)}
                                            {source.type === 'email_receipt' && renderEmailReceiptSource(source)}
                                            {source.type === 'cc_slip' && renderCcSlipSource(source)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // Use portal to render at document body level, escaping parent overflow:hidden
    return createPortal(modalContent, document.body);
}
