'use client';

import { useState } from 'react';
import { useCategories } from '@/lib/contexts/CategoriesContext';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    value?: string;
    onChange: (category: string) => void;
    disabled?: boolean;
    placeholder?: string;
    /** Filter by type - if not provided, shows all */
    type?: 'expense' | 'income';
}

export default function CategorySelector({ value, onChange, disabled, placeholder = 'Select Category...', type }: Props) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const { categories: allCategories, loading } = useCategories();

    // Filter by type if specified
    const categories = type
        ? allCategories.filter(c => c.type === type)
        : allCategories;

    const filtered = categories.filter(c =>
        c.name_english.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.name_hebrew?.includes(searchTerm)
    );

    // Close dropdown when clicking outside (simple implementation using backdrop)
    // For a robust one, we'd use popover primitive, but standard div overlay works for MVP.

    return (
        <div className="relative w-full max-w-[240px]">
            <button
                type="button"
                onClick={() => !disabled && setOpen(!open)}
                className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-sm bg-slate-950/40 border rounded-lg transition-all duration-200 text-left group",
                    open ? "border-violet-500/50 ring-1 ring-violet-500/20 bg-slate-900" : "border-white/10 hover:border-white/20 hover:bg-white/5",
                    disabled ? "opacity-50 cursor-not-allowed" : ""
                )}
            >
                <span className={cn(
                    "truncate transition-colors",
                    value ? "text-slate-100 font-medium" : "text-slate-500"
                )}>
                    {value || placeholder}
                </span>
                <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500 opacity-50 group-hover:opacity-100 transition-opacity" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute top-full left-0 w-[240px] mt-2 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/50">
                        {/* Search */}
                        <div className="p-2 border-b border-white/5 flex items-center gap-2 sticky top-0 bg-slate-900/95">
                            <Search className="w-3.5 h-3.5 text-slate-500" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Filter categories..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="bg-transparent border-none text-sm focus:ring-0 p-1 text-slate-200 w-full placeholder:text-slate-600 font-medium"
                            />
                        </div>

                        {/* List */}
                        <div className="max-h-[220px] overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                            {loading && <div className="text-xs text-slate-500 p-3 text-center">Loading categories...</div>}

                            {!loading && filtered.length === 0 && (
                                <div className="text-xs text-slate-500 p-3 text-center">No categories found</div>
                            )}

                            {filtered.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        onChange(cat.name_english);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-all text-left group",
                                        value === cat.name_english
                                            ? "bg-violet-500/10 text-violet-300 font-medium"
                                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span>{cat.name_english}</span>
                                        {cat.name_hebrew && <span className="text-[10px] opacity-50 group-hover:opacity-80">{cat.name_hebrew}</span>}
                                    </div>
                                    {value === cat.name_english && <Check className="w-3.5 h-3.5 text-violet-400" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
