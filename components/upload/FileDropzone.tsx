'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone'; // You might need to install this: npm install react-dropzone

export default function FileDropzone({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
    const [dragActive, setDragActive] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles?.length > 0) {
            onFilesSelected(acceptedFiles);
        }
    }, [onFilesSelected]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'application/pdf': ['.pdf'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png']
        },
        multiple: true
    });

    return (
        <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer group
        ${isDragActive
                    ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                    : 'border-white/10 hover:border-violet-500/50 hover:bg-white/5'
                }`}
        >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-4">
                <div className={`p-4 rounded-full transition-all ${isDragActive ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-muted group-hover:bg-violet-500/10 group-hover:text-violet-300'}`}>
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                </div>
                <div>
                    <h3 className={`text-lg font-bold mb-1 transition-colors ${isDragActive ? 'text-violet-200' : 'text-main group-hover:text-white'}`}>
                        {isDragActive ? 'Drop files here!' : 'Click or Drag to Upload'}
                    </h3>
                    <p className="text-sm text-muted group-hover:text-slate-400 transition-colors">
                        Supports CSV, Excel, PDF, and <span className="text-violet-400">Screenshots (OCR)</span>
                    </p>
                </div>
                {!isDragActive && (
                    <div className="flex gap-2 justify-center mt-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-white/5">XLSX</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-white/5">CSV</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-white/5">PDF</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-violet-400/70 bg-violet-900/20 px-2 py-1 rounded border border-violet-500/20 shadow-[0_0_5px_rgba(139,92,246,0.2)]">Images</span>
                    </div>
                )}
            </div>
        </div>
    );
}
