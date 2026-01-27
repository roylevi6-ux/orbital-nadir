'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FileDropzone from '@/components/upload/FileDropzone';
import { parseFile } from '@/lib/parsing/engine';
import { saveTransactions } from '@/app/actions/save-transactions';
import { aiCategorizeTransactions } from '@/app/actions/ai-categorize';
import { checkForDuplicates } from '@/app/actions/check-duplicates';
import AppShell from '@/components/layout/AppShell';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ProcessingStep = 'idle' | 'parsing' | 'checking' | 'saving' | 'complete' | 'error';

export default function UploadPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [step, setStep] = useState<ProcessingStep>('idle');
    const [parseResults, setParseResults] = useState<any[]>([]);
    const [progress, setProgress] = useState({ saved: 0, duplicates: 0, total: 0 });
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();

    // Auto-process flow: Parse → Check Duplicates → Save (or Review) → Categorize → Redirect
    const processFiles = async (selectedFiles: File[]) => {
        setFiles(prev => [...prev, ...selectedFiles]);
        setStep('parsing');
        setErrorMessage(null);

        try {
            // Step 1: Parse all files
            const results = await Promise.all(selectedFiles.map(file => parseFile(file)));
            setParseResults(prev => [...prev, ...results]);

            // Collect all transactions
            const allTransactions = results.flatMap(r =>
                r.transactions.map((t: any) => ({
                    ...t,
                    sourceFile: r.fileName,
                    sourceType: r.sourceType
                }))
            );

            if (allTransactions.length === 0) {
                setStep('error');
                setErrorMessage('No transactions found in the uploaded files.');
                return;
            }

            setProgress({ saved: 0, duplicates: 0, total: allTransactions.length });

            // Step 2: Check for duplicates
            setStep('checking');
            toast.info('🔍 Checking for duplicates...', { duration: 2000 });

            const duplicateCheck = await checkForDuplicates(
                allTransactions.map(t => ({
                    date: t.date,
                    merchant_raw: t.merchant_raw,
                    amount: t.amount
                }))
            );

            if (duplicateCheck.hasDuplicates) {
                // Store transactions and duplicates in sessionStorage for review page
                sessionStorage.setItem('pendingTransactions', JSON.stringify(allTransactions));
                sessionStorage.setItem('duplicateMatches', JSON.stringify(duplicateCheck.matches));
                sessionStorage.setItem('sourceType', results[0]?.sourceType || 'upload');

                toast.warning(`Found ${duplicateCheck.matches.length} potential duplicates`, { duration: 3000 });

                // Redirect to review page for user confirmation
                setTimeout(() => {
                    router.push('/review?mode=duplicates');
                }, 500);
                return;
            }

            // No duplicates - proceed with save
            setStep('saving');
            const result = await saveTransactions(
                allTransactions.map(t => ({
                    ...t,
                    type: t.type === 'income' ? 'income' : 'expense'
                })),
                results[0]?.sourceType || 'upload'
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to save transactions');
            }

            const count = result.data.count;
            setProgress(prev => ({ ...prev, saved: count }));
            toast.success(`Saved ${count} transactions`);

            // Step 4: Done - redirect immediately (don't wait for AI)
            setStep('complete');
            toast.info('🤖 AI is categorizing in background...', { duration: 5000 });

            // Fire-and-forget: AI categorization runs in background
            aiCategorizeTransactions().then(result => {
                if (result.count > 0) {
                    logger.debug(`AI categorized ${result.count} transactions`);
                }
            }).catch(err => {
                logger.error('Background AI categorization error:', err);
            });

            // Redirect after brief delay
            setTimeout(() => {
                router.push('/transactions');
                router.refresh();
            }, 1000);

        } catch (error: any) {
            console.error('Processing error:', error);
            setStep('error');
            setErrorMessage(error.message || 'An error occurred during processing.');
            toast.error('Processing failed');
        }
    };

    const handleFilesSelected = (selectedFiles: File[]) => {
        processFiles(selectedFiles);
    };

    const resetUpload = () => {
        setFiles([]);
        setStep('idle');
        setParseResults([]);
        setProgress({ saved: 0, duplicates: 0, total: 0 });
        setErrorMessage(null);
    };

    return (
        <AppShell>
            <main className="max-w-4xl mx-auto px-6 py-8 space-y-8 animate-in">
                {/* Page Title */}
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-bright)]">Upload Data</h1>
                    <p className="text-muted text-sm">Import bank statements or screenshots — we'll categorize them automatically.</p>
                </div>

                {/* Processing Status */}
                {step !== 'idle' && (
                    <section className="holo-card p-8 border-white/10 shadow-lg shadow-black/20">
                        <div className="text-center space-y-6">
                            {/* Step Indicator */}
                            {step === 'parsing' && (
                                <>
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--neon-blue)]/20 text-[var(--neon-blue)] border border-[var(--neon-blue)]/30">
                                        <span className="text-2xl animate-pulse">📄</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Parsing Files...</h3>
                                    <p className="text-[var(--text-muted)]">Extracting transactions from your files</p>
                                </>
                            )}

                            {step === 'saving' && (
                                <>
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--neon-purple)]/20 text-[var(--neon-purple)] border border-[var(--neon-purple)]/30">
                                        <span className="text-2xl animate-pulse">💾</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Saving Transactions...</h3>
                                    <p className="text-[var(--text-muted)]">{progress.total} transactions ready to save</p>
                                </>
                            )}


                            {step === 'checking' && (
                                <>
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--neon-blue)]/20 text-[var(--neon-blue)] border border-[var(--neon-blue)]/30">
                                        <span className="text-2xl animate-pulse">🔍</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Checking for Duplicates...</h3>
                                    <p className="text-[var(--text-muted)]">Scanning {progress.total} transactions for potential duplicates</p>
                                </>
                            )}


                            {step === 'complete' && (
                                <>
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--neon-green)]/20 text-[var(--neon-green)] border border-[var(--neon-green)]/30">
                                        <span className="text-2xl">✅</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Complete!</h3>
                                    <p className="text-[var(--text-muted)]">
                                        Saved {progress.saved} transactions • AI running in background
                                    </p>
                                    <p className="text-sm text-[var(--neon-blue)]">Redirecting to transactions...</p>
                                </>
                            )}

                            {step === 'error' && (
                                <>
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--neon-pink)]/20 text-[var(--neon-pink)] border border-[var(--neon-pink)]/30">
                                        <span className="text-2xl">❌</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Error</h3>
                                    <p className="text-[var(--neon-pink)]">{errorMessage}</p>
                                    <button
                                        onClick={resetUpload}
                                        className="btn-primary px-6 py-2 mt-4"
                                    >
                                        Try Again
                                    </button>
                                </>
                            )}

                            {/* Progress bar */}
                            {(step === 'parsing' || step === 'checking' || step === 'saving') && (
                                <div className="w-full max-w-md mx-auto">
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-[var(--neon-purple)] via-[var(--neon-pink)] to-[var(--neon-blue)] transition-all duration-500"
                                            style={{
                                                width: step === 'parsing' ? '33%' :
                                                    step === 'checking' ? '50%' :
                                                        step === 'saving' ? '80%' : '100%'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Upload Section - Only show when idle */}
                {step === 'idle' && (
                    <section className="holo-card p-6 border-white/10 shadow-lg shadow-black/20">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-white mb-1">
                                Import Transaction Files
                            </h2>
                            <p className="text-sm text-[var(--text-muted)]">
                                Drag and drop your bank statements or screenshots here.
                                Files will be automatically saved and categorized by AI.
                            </p>
                        </div>

                        <FileDropzone onFilesSelected={handleFilesSelected} />

                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <span className="text-lg">📊</span>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Excel</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <span className="text-lg">📄</span>
                                <p className="text-xs text-[var(--text-muted)] mt-1">CSV</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <span className="text-lg">📑</span>
                                <p className="text-xs text-[var(--text-muted)] mt-1">PDF</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <span className="text-lg">📸</span>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Screenshots</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* How it works */}
                {step === 'idle' && (
                    <section className="space-y-4">
                        <h2 className="text-lg font-bold text-white">How It Works</h2>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <span className="text-2xl">1️⃣</span>
                                <h3 className="font-bold text-white mt-2">Upload</h3>
                                <p className="text-xs text-[var(--text-muted)]">Drop your files — we support Excel, CSV, PDF, and screenshots</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <span className="text-2xl">2️⃣</span>
                                <h3 className="font-bold text-white mt-2">Auto-Save</h3>
                                <p className="text-xs text-[var(--text-muted)]">Transactions are parsed and saved automatically</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <span className="text-2xl">3️⃣</span>
                                <h3 className="font-bold text-white mt-2">AI Categorize</h3>
                                <p className="text-xs text-[var(--text-muted)]">AI classifies transactions with verified or pending status</p>
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </AppShell>
    );
}
