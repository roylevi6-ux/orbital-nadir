'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/auth/supabase';
import { sendReminders } from '@/app/actions/send-reminders';
import { getReceiptForwardingEmail } from '@/app/actions/get-receipt-token';
import {
    getSpenderConfig,
    getCardMappings,
    updateSpenderConfig,
    saveCardMapping,
    deleteCardMapping
} from '@/app/actions/spender-detection';
import { toast } from 'sonner';
import { LogOut, User, Mail, Shield, Bell, Receipt, Copy, Check, CreditCard, Users, Plus, Trash2, Save, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { SpenderConfig, CardMapping, Spender } from '@/lib/spender-utils';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [receiptEmail, setReceiptEmail] = useState<string>('');
    const [receiptEmailLoading, setReceiptEmailLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Spender & Card state
    const [spenders, setSpenders] = useState<SpenderConfig[]>([]);
    const [cardMappings, setCardMappings] = useState<CardMapping[]>([]);
    const [spendersLoading, setSpendersLoading] = useState(true);
    const [editingSpender, setEditingSpender] = useState<Spender | null>(null);
    const [editingSpenderName, setEditingSpenderName] = useState('');
    const [editingSpenderColor, setEditingSpenderColor] = useState('');
    const [addingCard, setAddingCard] = useState(false);
    const [newCardEnding, setNewCardEnding] = useState('');
    const [newCardSpender, setNewCardSpender] = useState<Spender>('R');
    const [newCardNickname, setNewCardNickname] = useState('');
    const [savingSpender, setSavingSpender] = useState(false);
    const [savingCard, setSavingCard] = useState(false);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUser(user);
        };
        getUser();

        // Fetch receipt forwarding email
        const fetchReceiptEmail = async () => {
            const result = await getReceiptForwardingEmail();
            if (result.success) {
                setReceiptEmail(result.data.email);
            }
            setReceiptEmailLoading(false);
        };
        fetchReceiptEmail();

        // Fetch spenders and card mappings
        const fetchSpenderData = async () => {
            try {
                const [spenderResult, cardResult] = await Promise.all([
                    getSpenderConfig(),
                    getCardMappings()
                ]);

                if (spenderResult.success) {
                    setSpenders(spenderResult.data);
                }
                if (cardResult.success) {
                    setCardMappings(cardResult.data);
                }
            } catch (e) {
                console.error('Failed to load spender data:', e);
            } finally {
                setSpendersLoading(false);
            }
        };
        fetchSpenderData();
    }, []);

    const handleCopyReceiptEmail = () => {
        navigator.clipboard.writeText(receiptEmail);
        setCopied(true);
        toast.success('Email copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleTestNotification = async () => {
        setLoading(true);
        try {
            const result = await sendReminders();
            if (result.success) {
                if (result.message) {
                    toast.success(result.message);
                } else {
                    toast.success(`Email sent to ${result.sentTo}`, {
                        description: `${result.items} items require attention`
                    });
                }
            } else {
                toast.error('Failed to send notification', {
                    description: result.error
                });
            }
        } catch (e) {
            toast.error('Failed to send notification');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    // Spender editing handlers
    const handleEditSpender = (spender: SpenderConfig) => {
        setEditingSpender(spender.spender_key);
        setEditingSpenderName(spender.display_name);
        setEditingSpenderColor(spender.color);
    };

    const handleCancelEditSpender = () => {
        setEditingSpender(null);
        setEditingSpenderName('');
        setEditingSpenderColor('');
    };

    const handleSaveSpender = async () => {
        if (!editingSpender || !editingSpenderName.trim()) return;

        setSavingSpender(true);
        try {
            const result = await updateSpenderConfig(
                editingSpender,
                editingSpenderName.trim(),
                editingSpenderColor
            );
            if (result.success) {
                setSpenders(prev => prev.map(s =>
                    s.spender_key === editingSpender
                        ? { ...s, display_name: editingSpenderName.trim(), color: editingSpenderColor }
                        : s
                ));
                toast.success('Spender updated');
                handleCancelEditSpender();
            } else {
                toast.error('Failed to update spender');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to update spender');
        } finally {
            setSavingSpender(false);
        }
    };

    // Card mapping handlers
    const handleAddCard = async () => {
        if (!newCardEnding.trim() || newCardEnding.length !== 4) {
            toast.error('Card ending must be 4 digits');
            return;
        }

        setSavingCard(true);
        try {
            const result = await saveCardMapping(
                newCardEnding.trim(),
                newCardSpender,
                newCardNickname.trim() || undefined
            );
            if (result.success) {
                setCardMappings(prev => [
                    ...prev.filter(c => c.card_ending !== newCardEnding.trim()),
                    {
                        card_ending: newCardEnding.trim(),
                        spender: newCardSpender,
                        card_nickname: newCardNickname.trim() || null
                    }
                ]);
                toast.success('Card mapping saved');
                setAddingCard(false);
                setNewCardEnding('');
                setNewCardSpender('R');
                setNewCardNickname('');
            } else {
                toast.error('Failed to save card mapping');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to save card mapping');
        } finally {
            setSavingCard(false);
        }
    };

    const handleDeleteCard = async (cardEnding: string) => {
        try {
            const result = await deleteCardMapping(cardEnding);
            if (result.success) {
                setCardMappings(prev => prev.filter(c => c.card_ending !== cardEnding));
                toast.success('Card mapping deleted');
            } else {
                toast.error('Failed to delete card mapping');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to delete card mapping');
        }
    };

    const getSpenderDisplayName = (spenderKey: Spender) => {
        const spender = spenders.find(s => s.spender_key === spenderKey);
        return spender?.display_name || spenderKey;
    };

    const getSpenderColor = (spenderKey: Spender) => {
        const spender = spenders.find(s => s.spender_key === spenderKey);
        return spender?.color || '#6B7280';
    };

    return (
        <AppShell>
            <main className="max-w-2xl mx-auto px-6 py-8 animate-in">
                {/* Page Title */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-[var(--text-bright)]">Settings</h1>
                    <p className="text-muted text-sm">Manage preferences and account details.</p>
                </div>

                {/* Notifications Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-violet-500/10 rounded-lg text-violet-400">
                            <Bell size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Notifications & Alerts</h2>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)]">
                        <div>
                            <h3 className="text-sm font-bold text-gray-200">Email Reminders</h3>
                            <p className="text-xs text-muted mt-1">
                                Receive monthly digests on the 5th and 15th if action is needed.
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleTestNotification}
                                disabled={loading}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-lg shadow-violet-500/20 transition-all uppercase tracking-wide"
                            >
                                {loading ? 'Sending...' : 'Test Now'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Receipt Forwarding Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                            <Receipt size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Email Receipts</h2>
                    </div>

                    <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)]">
                        <h3 className="text-sm font-bold text-gray-200 mb-2">Forward Receipts</h3>
                        <p className="text-xs text-muted mb-4">
                            Forward purchase receipts to this email address. They will be automatically
                            parsed and matched to your transactions for better categorization.
                        </p>

                        {receiptEmailLoading ? (
                            <div className="h-10 bg-slate-800/50 rounded animate-pulse" />
                        ) : (
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-emerald-400 font-mono overflow-x-auto">
                                    {receiptEmail || 'Not available'}
                                </code>
                                <button
                                    onClick={handleCopyReceiptEmail}
                                    disabled={!receiptEmail}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                            <h4 className="text-xs font-bold text-slate-400 mb-2">Gmail Filter Setup</h4>
                            <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                                <li>Go to Gmail Settings &rarr; Filters and Blocked Addresses</li>
                                <li>Create a filter with: Has the words: &quot;receipt&quot; OR &quot;order confirmation&quot;</li>
                                <li>Action: Forward to the address above</li>
                            </ol>
                        </div>
                    </div>
                </section>

                {/* Spenders & Cards Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400">
                            <Users size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Spenders & Cards</h2>
                    </div>

                    {spendersLoading ? (
                        <div className="space-y-4">
                            <div className="h-20 bg-slate-800/50 rounded-xl animate-pulse" />
                            <div className="h-20 bg-slate-800/50 rounded-xl animate-pulse" />
                        </div>
                    ) : (
                        <>
                            {/* Spender Configuration */}
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-gray-200 mb-3">Household Members</h3>
                                <div className="space-y-3">
                                    {spenders.length === 0 && (
                                        <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] text-center">
                                            <Users className="mx-auto mb-2 text-muted" size={24} />
                                            <p className="text-sm text-muted">No household members configured</p>
                                            <p className="text-xs text-muted mt-1">
                                                Run the database migration to seed default spenders (R and N)
                                            </p>
                                        </div>
                                    )}
                                    {spenders.map(spender => (
                                        <div
                                            key={spender.spender_key}
                                            className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)]"
                                        >
                                            {editingSpender === spender.spender_key ? (
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="text"
                                                            value={editingSpenderName}
                                                            onChange={(e) => setEditingSpenderName(e.target.value)}
                                                            placeholder="Display name"
                                                            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-pink-500"
                                                            maxLength={20}
                                                        />
                                                        <input
                                                            type="color"
                                                            value={editingSpenderColor}
                                                            onChange={(e) => setEditingSpenderColor(e.target.value)}
                                                            className="w-10 h-10 rounded-lg cursor-pointer border-2 border-slate-600"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={handleCancelEditSpender}
                                                            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveSpender}
                                                            disabled={savingSpender || !editingSpenderName.trim()}
                                                            className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-all"
                                                        >
                                                            <Save size={12} />
                                                            {savingSpender ? 'Saving...' : 'Save'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm"
                                                            style={{ backgroundColor: spender.color }}
                                                        >
                                                            {spender.spender_key}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-white">{spender.display_name}</p>
                                                            <p className="text-xs text-muted">Spender key: {spender.spender_key}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditSpender(spender)}
                                                        className="px-3 py-1.5 text-xs text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg transition-all cursor-pointer"
                                                    >
                                                        Edit
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Card Mappings */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-gray-200">Card Mappings</h3>
                                    {!addingCard && (
                                        <button
                                            type="button"
                                            onClick={() => setAddingCard(true)}
                                            className="px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-1"
                                        >
                                            <Plus size={12} />
                                            Add Card
                                        </button>
                                    )}
                                </div>

                                {/* Add Card Form */}
                                {addingCard && (
                                    <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20 mb-3">
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-3 gap-3">
                                                <div>
                                                    <label className="text-xs text-muted block mb-1">Last 4 Digits</label>
                                                    <input
                                                        type="text"
                                                        value={newCardEnding}
                                                        onChange={(e) => setNewCardEnding(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                                        placeholder="8770"
                                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                                                        maxLength={4}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted block mb-1">Spender</label>
                                                    <select
                                                        value={newCardSpender}
                                                        onChange={(e) => setNewCardSpender(e.target.value as Spender)}
                                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                                                    >
                                                        {spenders.map(s => (
                                                            <option key={s.spender_key} value={s.spender_key}>
                                                                {s.display_name} ({s.spender_key})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted block mb-1">Nickname (optional)</label>
                                                    <input
                                                        type="text"
                                                        value={newCardNickname}
                                                        onChange={(e) => setNewCardNickname(e.target.value)}
                                                        placeholder="My Visa"
                                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                                                        maxLength={30}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAddingCard(false);
                                                        setNewCardEnding('');
                                                        setNewCardSpender('R');
                                                        setNewCardNickname('');
                                                    }}
                                                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                                                >
                                                    <X size={12} />
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleAddCard}
                                                    disabled={savingCard || newCardEnding.length !== 4}
                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-all"
                                                >
                                                    <Save size={12} />
                                                    {savingCard ? 'Saving...' : 'Save Card'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Card List */}
                                {cardMappings.length === 0 ? (
                                    <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] text-center">
                                        <CreditCard className="mx-auto mb-2 text-muted" size={24} />
                                        <p className="text-sm text-muted">No card mappings configured</p>
                                        <p className="text-xs text-muted mt-1">
                                            Add cards to automatically detect who made a transaction
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {cardMappings.map(card => (
                                            <div
                                                key={card.card_ending}
                                                className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <CreditCard size={16} className="text-muted" />
                                                        <span className="font-mono text-sm text-white">****{card.card_ending}</span>
                                                    </div>
                                                    <span className="text-muted text-xs">→</span>
                                                    <div
                                                        className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                                        style={{ backgroundColor: getSpenderColor(card.spender) }}
                                                    >
                                                        {getSpenderDisplayName(card.spender)}
                                                    </div>
                                                    {card.card_nickname && (
                                                        <span className="text-xs text-muted">({card.card_nickname})</span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteCard(card.card_ending)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all"
                                                    title="Delete mapping"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <p className="text-xs text-muted mt-3">
                                    Card mappings help automatically detect who made a transaction when uploading credit card statements or receiving SMS notifications.
                                </p>
                            </div>
                        </>
                    )}
                </section>

                {/* Account Section */}
                <section className="holo-card p-6 border-white/10 shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                            <User size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--text-bright)]">Account Details</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] flex items-center justify-between group hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-slate-800 rounded-full text-[var(--text-muted)]">
                                    <Mail size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-0.5">Email Address</p>
                                    <p className="text-sm font-medium text-[var(--text-bright)]">{user?.email || 'Loading...'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] flex items-center justify-between group hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-slate-800 rounded-full text-[var(--text-muted)]">
                                    <Shield size={16} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-0.5">User ID</p>
                                    <p className="text-xs font-mono text-[var(--text-muted)]">{user?.id || '...'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleSignOut}
                                className="w-full py-3 flex items-center justify-center gap-2 text-rose-400 hover:text-white hover:bg-rose-600 border border-rose-500/20 hover:border-rose-600 rounded-xl transition-all font-medium text-sm shadow-lg shadow-transparent hover:shadow-rose-600/20"
                            >
                                <LogOut size={16} />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </AppShell>
    );
}
