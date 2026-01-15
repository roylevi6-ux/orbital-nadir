'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createAccount, AccountType } from '@/app/actions/accounts';
import { toast } from 'sonner';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];
const TYPES: AccountType[] = ['savings', 'checking', 'investment', 'retirement', 'crypto', 'other'];

export default function NewAccountModal({ onComplete }: { onComplete: () => void }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        type: 'savings' as AccountType,
        balance: '',
        currency: 'ILS',
        institution: ''
    });

    const handleSubmit = async () => {
        if (!formData.name || !formData.balance) return;
        setLoading(true);
        try {
            await createAccount({
                name: formData.name,
                type: formData.type,
                balance: Number(formData.balance),
                currency: formData.currency,
                institution: formData.institution || null
            });
            toast.success('Account created');
            setOpen(false);
            setFormData({ name: '', type: 'savings', balance: '', currency: 'ILS', institution: '' });
            onComplete();
        } catch (e) {
            toast.error('Failed to create account');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-lg shadow-violet-500/25 flex items-center gap-2">
                    <span>+ New Account</span>
                </button>
            </DialogTrigger>
            <DialogContent className="bg-[#0f172a] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Add Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Account Name</label>
                        <input
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-violet-500"
                            placeholder="e.g. Emergency Fund"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Type</label>
                            <select
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-violet-500 capitalize"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value as AccountType })}
                            >
                                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Currency</label>
                            <select
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-violet-500"
                                value={formData.currency}
                                onChange={e => setFormData({ ...formData, currency: e.target.value })}
                            >
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Initial Balance</label>
                        <input
                            type="number"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-violet-500"
                            placeholder="0.00"
                            value={formData.balance}
                            onChange={e => setFormData({ ...formData, balance: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Institution (Optional)</label>
                        <input
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-violet-500"
                            placeholder="e.g. Bank Leumi"
                            value={formData.institution}
                            onChange={e => setFormData({ ...formData, institution: e.target.value })}
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !formData.name || !formData.balance}
                        className="w-full bg-violet-600 hover:bg-violet-500 py-2 rounded-lg font-bold mt-4 disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : 'Create Account'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
