'use client';

import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <Sidebar />

            {/* Main Content Area - Padded on desktop for sidebar */}
            <div className="md:pl-64 min-h-screen transition-all duration-300">
                {children}
            </div>
        </div>
    );
}
