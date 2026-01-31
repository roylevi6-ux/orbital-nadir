'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getNavCounts, NavCounts } from '@/app/actions/get-nav-counts';
import { Zap, Sparkles, PiggyBank, Upload, Settings, LucideIcon } from 'lucide-react';

interface NavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    activeBg: string;
    glow: string;
}

const navItems: NavItem[] = [
    { name: 'Analytics', href: '/dashboard', icon: Zap, activeBg: 'bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]', glow: 'shadow-[0_0_20px_rgba(72,219,251,0.4)]' },
    { name: 'Transactions', href: '/transactions', icon: Sparkles, activeBg: 'bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]', glow: 'shadow-[0_0_20px_rgba(255,121,198,0.4)]' },
    { name: 'Savings & Investments', href: '/accounts', icon: PiggyBank, activeBg: 'bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]', glow: 'shadow-[0_0_20px_rgba(120,119,198,0.4)]' },
    { name: 'Upload', href: '/upload', icon: Upload, activeBg: 'bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]', glow: 'shadow-[0_0_20px_rgba(72,219,251,0.4)]' },
    { name: 'Settings', href: '/settings', icon: Settings, activeBg: 'bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]', glow: 'shadow-[0_0_20px_rgba(120,119,198,0.4)]' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [counts, setCounts] = useState<NavCounts>({ total: 0, pending: 0, verified: 0, skipped: 0 });

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const data = await getNavCounts();
                setCounts(data);
            } catch (error) {
                console.error('Failed to fetch nav counts', error);
            }
        };
        fetchCounts();

        // Poll every 30s
        const interval = setInterval(fetchCounts, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-[var(--bg-overlay)] backdrop-blur-xl border-r border-[var(--border-neon)] flex flex-col z-50 hidden md:flex">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b border-[var(--border-glass)]">
                <span className="text-xl font-bold bg-gradient-to-r from-[var(--neon-blue)] via-[var(--neon-pink)] to-[var(--neon-purple)] bg-clip-text text-transparent">
                    ◈ ORBITAL <span className="text-[var(--text-bright)] font-light text-sm ml-1">NADIR</span>
                </span>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;

                    // Show total transaction count on Transactions nav item
                    const showBadge = item.name === 'Transactions' && counts.total > 0;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${isActive
                                ? `${item.activeBg} text-white ${item.glow}`
                                : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {isActive && (
                                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--neon-blue)] to-[var(--neon-pink)] ${item.glow}`} />
                            )}
                            <div className={`icon-glow w-8 h-8 flex items-center justify-center ${isActive ? '' : 'bg-white/5 shadow-none'}`}>
                                <item.icon className="w-4 h-4" />
                            </div>
                            <span className="font-medium flex-1 text-sm">{item.name}</span>

                            {/* Total transactions badge */}
                            {showBadge && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--text-muted)]/30 text-[var(--text-muted)]">
                                    {counts.total}
                                </span>
                            )}

                            {/* Shimmer on hover */}
                            {!isActive && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity animate-shimmer" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Profile / Bottom */}
            <div className="p-4 border-t border-[var(--border-glass)]">
                <div className="p-4 rounded-xl bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-neon)] flex items-center gap-3 hover:shadow-[var(--shadow-glow)] transition-all cursor-pointer group">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-pink)] flex items-center justify-center text-white font-bold shadow-[var(--shadow-glow)] group-hover:scale-110 transition-transform">
                        ◈
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold text-[var(--text-bright)] truncate">Orbital Nadir</p>
                        <p className="text-xs text-[var(--neon-blue)] truncate">Pro Plan ⚡</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
