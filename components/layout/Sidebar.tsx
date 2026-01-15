'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CreditCard, ArrowRightLeft, PieChart, Upload, Settings, SearchCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getNavCounts, NavCounts } from '@/app/actions/get-nav-counts';

const navItems = [
    { name: 'Analytics', href: '/dashboard', icon: LayoutDashboard, color: 'text-violet-400', activeBg: 'bg-violet-500/10', glow: 'shadow-[0_0_10px_#8b5cf6]' },
    { name: 'Review', href: '/review', icon: SearchCheck, color: 'text-amber-400', activeBg: 'bg-amber-500/10', glow: 'shadow-[0_0_10px_#f59e0b]' },
    { name: 'Transactions', href: '/transactions', icon: ArrowRightLeft, color: 'text-violet-400', activeBg: 'bg-violet-500/10', glow: 'shadow-[0_0_10px_#8b5cf6]' },
    { name: 'Savings & Investments', href: '/accounts', icon: CreditCard, color: 'text-cyan-400', activeBg: 'bg-cyan-500/10', glow: 'shadow-[0_0_10px_#06b6d4]' },
    // { name: 'Budgets', href: '/budgets', icon: PieChart, color: 'text-cyan-400', activeBg: 'bg-cyan-500/10', glow: 'shadow-[0_0_10px_#06b6d4]' }, // Hidden for now
    { name: 'Upload', href: '/upload', icon: Upload, color: 'text-violet-400', activeBg: 'bg-violet-500/10', glow: 'shadow-[0_0_10px_#8b5cf6]' },
    { name: 'Settings', href: '/settings', icon: Settings, color: 'text-cyan-400', activeBg: 'bg-cyan-500/10', glow: 'shadow-[0_0_10px_#06b6d4]' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [counts, setCounts] = useState<NavCounts>({ pending: 0, skipped: 0 });

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const data = await getNavCounts();
                setCounts(data);
            } catch (error) {
                console.error('Failed to fetch nav counts', error);
            }
        };
        fetchCounts(); // Initial fetch

        // Optional: Poll every 30s or listen to events
        const interval = setInterval(fetchCounts, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-[#0B0F19] border-r border-white/5 flex flex-col z-50 hidden md:flex">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b border-white/5">
                <span className="text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                    MIDNIGHT <span className="text-white font-light text-sm ml-1">PRO</span>
                </span>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    // Badge Logic
                    let badgeCount = 0;
                    let badgeColor = "";

                    if (item.name === 'Review' && counts.pending > 0) {
                        badgeCount = counts.pending;
                        badgeColor = "bg-amber-500 text-amber-950";
                    }
                    if (item.name === 'Transactions' && counts.skipped > 0) {
                        badgeCount = counts.skipped;
                        badgeColor = "bg-slate-700 text-slate-300"; // Modest badge for skipped
                    }

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${isActive
                                ? `${item.activeBg} text-white shadow-[0_0_20px_rgba(0,0,0,0.2)]`
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {isActive && (
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.color.replace('text-', 'bg-')} ${item.glow}`} />
                            )}
                            <item.icon className={`w-5 h-5 ${isActive ? item.color : 'text-slate-500 group-hover:text-white transition-colors'}`} />
                            <span className="font-medium flex-1">{item.name}</span>

                            {/* Badge */}
                            {badgeCount > 0 && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg ${badgeColor} animate-in fade-in zoom-in-50 duration-300`}>
                                    {badgeCount}
                                </span>
                            )}

                            {/* Glow on hover */}
                            {!isActive && (
                                <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Profile / Bottom */}
            <div className="p-4 border-t border-white/5">
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3 hover:bg-white/10 transition-colors cursor-pointer group">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg group-hover:shadow-violet-500/20 transition-all">
                        ON
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold text-white truncate">Orbital Nadir</p>
                        <p className="text-xs text-muted truncate">Pro Plan</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
