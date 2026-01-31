'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import FileDropzone from '@/components/upload/FileDropzone';
import { parseFile } from '@/lib/parsing/engine';
import { ParseResult, ParsedTransaction } from '@/lib/parsing/types';
import { saveTransactions } from '@/app/actions/save-transactions';
import { aiCategorizeTransactions } from '@/app/actions/ai-categorize';
import { getPendingReconciliationCount } from '@/app/actions/p2p-reconciliation';
import type { Spender, SpenderDetectionResult } from '@/lib/spender-utils';
import { detectSpenderFromFile } from '@/app/actions/spender-detection';
import SpenderSelector from '@/components/upload/SpenderSelector';
import AppShell from '@/components/layout/AppShell';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ProcessingStep = 'idle' | 'parsing' | 'spender_selection' | 'saving' | 'reconciling' | 'complete' | 'error';

export default function UploadPage() {
    const [step, setStep] = useState<ProcessingStep>('idle');
    const [parseResults, setParseResults] = useState<ParseResult[]>([]);
    const [progress, setProgress] = useState({ saved: 0, duplicates: 0, total: 0 });
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [spenderDetection, setSpenderDetection] = useState<SpenderDetectionResult | null>(null);
    const [selectedSpender, setSelectedSpender] = useState<Spender | null>(null);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const router = useRouter();

    // Save transactions with spender assignment
    const saveWithSpender = async (
        results: ParseResult[],
        spender: Spender | null,
        primaryFilename?: string
    ) => {
        // Collect all transactions, preserving each file's sourceType
        const allTransactions = results.flatMap(r =>
            r.transactions.map((t: ParsedTransaction) => ({
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

        // Step 2: Save transactions - group by sourceType to preserve correct source
        setStep('saving');

        // Group transactions by sourceType
        const bySourceType = new Map<string, typeof allTransactions>();
        for (const t of allTransactions) {
            const st = t.sourceType || 'upload';
            if (!bySourceType.has(st)) bySourceType.set(st, []);
            bySourceType.get(st)!.push(t);
        }

        // Save each group with its correct sourceType and spender
        let totalSaved = 0;
        let totalReceiptMatches = 0;
        for (const [sourceType, txs] of bySourceType) {
            const result = await saveTransactions(
                txs.map(t => ({
                    ...t,
                    type: t.type === 'income' ? 'income' : 'expense'
                })),
                sourceType,
                {
                    spender,
                    sourceFile: primaryFilename || results[0]?.fileName
                }
            );
            if (!result.success) {
                throw new Error(result.error || 'Failed to save transactions');
            }
            totalSaved += result.data.count;
            totalReceiptMatches += result.data.receiptMatches || 0;
        }

        const count = totalSaved;
        setProgress(prev => ({ ...prev, saved: count }));

        // Step 3: Check for P2P reconciliation needs (BIT/Paybox matching)
        setStep('reconciling');
        const reconciliationCounts = await getPendingReconciliationCount();
        const needsReview = reconciliationCounts.matches + reconciliationCounts.reimbursements;

        if (needsReview > 0) {
            // Store flag to open reconciliation modal on transactions page
            sessionStorage.setItem('openReconciliation', 'true');
        }

        // Step 4: Done - redirect immediately (don't wait for AI)
        setStep('complete');

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
    };

    // Auto-process flow: Parse → Detect Spender → (Select if needed) → Save → Categorize → Redirect
    const processFiles = async (selectedFiles: File[]) => {
        setStep('parsing');
        setErrorMessage(null);
        setPendingFiles(selectedFiles);

        try {
            // Step 1: Parse all files
            const results = await Promise.all(selectedFiles.map(file => parseFile(file)));
            setParseResults(results);

            const totalTransactions = results.reduce((sum, r) => sum + r.transactions.length, 0);
            if (totalTransactions === 0) {
                setStep('error');
                setErrorMessage('No transactions found in the uploaded files.');
                return;
            }

            // Step 1.5: Detect spender from file metadata
            // Try the first file's name and sourceType to detect card
            const primaryFile = selectedFiles[0];
            const primaryResult = results[0];

            const isScreenshot = primaryResult?.sourceType === 'screenshot';

            if (isScreenshot) {
                // Screenshots (BIT/Paybox) don't have card info - always ask for spender
                logger.info('[Upload] Screenshot detected, asking for spender');
                setSpenderDetection({
                    detected: false,
                    spender: null,
                    card_ending: null,
                    source: 'manual',
                    confidence: 0
                });
                setStep('spender_selection');
                return;
            }

            // Try to detect spender from filename (for CC slips, bank statements)
            const detection = await detectSpenderFromFile(primaryFile.name);

            if (detection.success && detection.data) {
                setSpenderDetection(detection.data);

                if (detection.data.detected && detection.data.spender) {
                    // Auto-detected! Proceed with saving
                    logger.info('[Upload] Auto-detected spender:', detection.data);
                    await saveWithSpender(results, detection.data.spender, primaryFile.name);
                    return;
                }

                // Card found but no mapping, or no card found - need user selection
                logger.info('[Upload] Spender not auto-detected, asking user');
                setStep('spender_selection');
                return;
            }

            // Detection failed - still ask for spender selection
            logger.info('[Upload] Spender detection failed, asking user');
            setStep('spender_selection');

        } catch (error: unknown) {
            console.error('Processing error:', error);
            setStep('error');
            setErrorMessage(error instanceof Error ? error.message : 'An error occurred during processing.');
            toast.error('Processing failed');
        }
    };

    // Handle spender selection from user
    const handleSpenderSelected = async (spender: Spender) => {
        setSelectedSpender(spender);

        try {
            await saveWithSpender(parseResults, spender, pendingFiles[0]?.name);
        } catch (error: unknown) {
            console.error('Processing error after spender selection:', error);
            setStep('error');
            setErrorMessage(error instanceof Error ? error.message : 'An error occurred during processing.');
            toast.error('Processing failed');
        }
    };

    const handleFilesSelected = (selectedFiles: File[]) => {
        processFiles(selectedFiles);
    };

    const resetUpload = () => {
        setStep('idle');
        setParseResults([]);
        setProgress({ saved: 0, duplicates: 0, total: 0 });
        setErrorMessage(null);
        setSpenderDetection(null);
        setSelectedSpender(null);
        setPendingFiles([]);
    };

    return (
        <AppShell>
            <main className="max-w-4xl mx-auto px-6 py-8 space-y-8 animate-in">
                {/* Page Title */}
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-bright)]">Upload Data</h1>
                    <p className="text-muted text-sm">Import bank statements or screenshots — we&apos;ll categorize them automatically.</p>
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

                            {step === 'spender_selection' && (
                                <div className="text-left max-w-lg mx-auto">
                                    <SpenderSelector
                                        detectedCardEnding={spenderDetection?.card_ending}
                                        autoDetectedSpender={spenderDetection?.detected ? spenderDetection.spender : null}
                                        onSpenderSelected={handleSpenderSelected}
                                        transactionCount={parseResults.reduce((sum, r) => sum + r.transactions.length, 0)}
                                        filename={pendingFiles[0]?.name}
                                    />
                                    <button
                                        onClick={resetUpload}
                                        className="mt-4 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        ← Cancel and start over
                                    </button>
                                </div>
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


                            {step === 'reconciling' && (
                                <>
                                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--neon-blue)]/20 text-[var(--neon-blue)] border border-[var(--neon-blue)]/30">
                                        <span className="text-2xl animate-pulse">🔄</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Checking for BIT/Paybox Matches...</h3>
                                    <p className="text-[var(--text-muted)]">Finding P2P payments to reconcile</p>
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
                            {(step === 'parsing' || step === 'saving' || step === 'reconciling') && (
                                <div className="w-full max-w-md mx-auto">
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-[var(--neon-purple)] via-[var(--neon-pink)] to-[var(--neon-blue)] transition-all duration-500"
                                            style={{
                                                width: step === 'parsing' ? '25%' :
                                                    step === 'saving' ? '60%' :
                                                        step === 'reconciling' ? '85%' : '100%'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            {/* Spender selection doesn't show progress bar - it's waiting for user input */}
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
