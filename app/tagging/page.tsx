'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AlertBadges from '@/components/dashboard/AlertBadges';
import AIChatSidebar from '@/components/dashboard/AIChatSidebar';
import CategorizeButton from '@/components/dashboard/CategorizeButton';

export default function TaggingPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            ← Dashboard
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            🏷️ Tagging Session
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => router.push('/reconciliation')}
                            className="px-4 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg font-medium"
                        >
                            Go to Deduplication
                        </button>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="px-4 py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 rounded-lg font-medium"
                        >
                            Done & Finish
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* 1. Alerts & Actions */}
                <section>
                    <AlertBadges />
                </section>

                {/* 2. Main Action Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Auto-Categorize Card */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            🤖 AI Categorization
                        </h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Let the AI guess categories for your new transactions.
                        </p>
                        <CategorizeButton />
                    </div>

                    {/* Manual Review Card (Placeholder for now, or link to Transactions with filter) */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            📝 Manual Review
                        </h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Review transactions one by one or in bulk.
                        </p>
                        <button
                            onClick={() => router.push('/transactions?filter=uncategorized')}
                            className="w-full py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 shadow-sm"
                        >
                            Review Uncategorized Items
                        </button>
                    </div>
                </div>

            </main>

            <AIChatSidebar />
        </div>
    );
}
