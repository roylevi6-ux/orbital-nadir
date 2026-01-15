'use client';

import { Account, updateAccountBalance } from '@/app/actions/accounts';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function AccountCard({ account, onUpdate }: { account: Account, onUpdate: () => void }) {
    const [showUpdate, setShowUpdate] = useState(false);
    const [newBalance, setNewBalance] = useState('');
    const [loading, setLoading] = useState(false);

    const handleUpdate = async () => {
        if (!newBalance) return;
        setLoading(true);
        try {
            await updateAccountBalance(account.id, Number(newBalance), 'Manual Update');
            toast.success('Balance updated');
            setShowUpdate(false);
            setNewBalance('');
            onUpdate();
        } catch (e) {
            toast.error('Failed to update');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 hover:bg-slate-900 transition-all group relative overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">{account.type}</div>
                        <h3 className="font-bold text-lg text-white">{account.name}</h3>
                        <p className="text-sm text-slate-400">{account.institution}</p>
                    </div>
                    <div className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-400 font-mono">
                        {account.currency}
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-2xl font-mono font-bold text-white">
                            {account.currency === 'ILS' ? '₪' : account.currency === 'USD' ? '$' : account.currency === 'EUR' ? '€' : ''}
                            {account.balance.toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowUpdate(true)}
                        className="text-sm text-violet-400 hover:text-violet-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Update
                    </button>
                </div>
            </div>

            {/* Update Modal */}
            <Dialog open={showUpdate} onOpenChange={setShowUpdate}>
                <DialogContent className="bg-[#0f172a] border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>Update Balance: {account.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <p className="text-sm text-slate-400">
                            Current Balance: <span className="text-white font-mono">{account.balance.toLocaleString()} {account.currency}</span>
                        </p>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">New Balance</label>
                            <input
                                type="number"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-violet-500 font-mono text-lg"
                                placeholder="0.00"
                                value={newBalance}
                                onChange={e => setNewBalance(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={handleUpdate}
                            disabled={loading || !newBalance}
                            className="w-full bg-violet-600 hover:bg-violet-500 py-2 rounded-lg font-bold mt-2 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save New Balance'}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
