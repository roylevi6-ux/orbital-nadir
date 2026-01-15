'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import FileDropzone from '@/components/upload/FileDropzone';
import UploadPreview from '@/components/upload/UploadPreview';
import { parseFile } from '@/lib/parsing/engine';
import AppShell from '@/components/layout/AppShell';

export default function UploadPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [parseResults, setParseResults] = useState<any[]>([]);
    const [savedFiles, setSavedFiles] = useState<Set<number>>(new Set());
    const [activeReviewIndex, setActiveReviewIndex] = useState<number | null>(null);
    const router = useRouter();

    const handleFilesSelected = async (selectedFiles: File[]) => {
        console.log('Files selected:', selectedFiles);
        setFiles(prev => [...prev, ...selectedFiles]);
        setIsProcessing(true);

        try {
            const results = await Promise.all(selectedFiles.map(file => parseFile(file)));
            console.log('Parse Results:', results);
            setParseResults(prev => [...prev, ...results]);
        } catch (error) {
            console.error('Error parsing files:', error);
            alert('Failed to parse some files. Check console.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveSuccess = (index: number) => {
        // Success callback from Batch Process
        // Since we processed everything, we just redirect.
        // The batch process already showed progress.
        router.push('/dashboard');
    };

    return (
        <AppShell>
            <main className="max-w-4xl mx-auto px-6 py-8 space-y-8 animate-in">
                {/* Page Title */}
                <div>
                    <h1 className="text-2xl font-bold text-white">Upload Data</h1>
                    <p className="text-muted text-sm">Import bank statements or screenshots.</p>
                </div>

                {/* Batch Review Section */}
                {activeReviewIndex !== null && (
                    <section className="mb-8">
                        <UploadPreview
                            files={parseResults.filter((_, i) => !savedFiles.has(i)).map(r => ({
                                fileId: r.fileName,
                                transactions: r.transactions,
                                sourceType: r.sourceType
                            }))}
                            onCancel={() => setActiveReviewIndex(null)}
                            onSuccess={() => handleSaveSuccess(0)}
                        />
                    </section>
                )}

                {/* Upload Section */}
                {activeReviewIndex === null && (
                    <section className="card p-6 border-white/10 shadow-lg shadow-black/20">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-white mb-1">
                                Import Transaction Files
                            </h2>
                            <p className="text-sm text-muted">Drag and drop your bank statements or screenshots here.</p>
                        </div>

                        <FileDropzone onFilesSelected={handleFilesSelected} />

                        {/* File List */}
                        {(files.length > 0 || parseResults.length > 0) && (
                            <div className="mt-8 space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Files Queue</h3>
                                    {/* Review All Button */}
                                    {parseResults.some((_, i) => !savedFiles.has(i)) && (
                                        <button
                                            onClick={() => setActiveReviewIndex(999)}
                                            className="text-xs bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg shadow-lg shadow-violet-500/20 font-bold uppercase tracking-wide transition-all active:scale-95"
                                        >
                                            Review All & Process
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    {parseResults.map((result, idx) => {
                                        const isSaved = savedFiles.has(idx);

                                        return (
                                            <div key={idx} className={`flex items-center justify-between p-4 rounded-xl border transition-all
                                        ${isSaved
                                                    ? 'bg-emerald-500/5 border-emerald-500/20'
                                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                }`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border shadow-lg ${isSaved
                                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                        }`}>
                                                        {isSaved ? '✓' : (result.sourceType === 'screenshot' ? '📸' : '📄')}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-200">{result.fileName}</p>
                                                        <p className="text-xs text-muted">
                                                            {result.validRows} transactions • <span className="uppercase">{result.sourceType}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                {isSaved && (
                                                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">SAVED</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {isProcessing && (
                                    <div className="p-8 text-center">
                                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mb-4"></div>
                                        <p className="text-sm text-violet-300 animate-pulse">Processing files with AI...</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* History Section Placeholder */}
                <section>
                    <h2 className="text-lg font-bold text-white mb-4">
                        Recent Uploads
                    </h2>
                    <div className="text-center p-8 bg-white/5 rounded-xl border border-white/5 border-dashed">
                        <p className="text-muted text-sm">No upload history yet</p>
                    </div>
                </section>
            </main>
        </AppShell>
    );
}
