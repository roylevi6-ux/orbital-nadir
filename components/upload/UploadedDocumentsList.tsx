'use client';

import { useState, useEffect } from 'react';
import { FileText, Trash2, Calendar, Hash, AlertTriangle, FileSpreadsheet, FileImage, File } from 'lucide-react';
import { getUploadedDocuments, deleteDocument, UploadedDocument } from '@/app/actions/documents';
import SpenderBadge from '@/components/transactions/SpenderBadge';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface UploadedDocumentsListProps {
    onDocumentDeleted?: () => void;
    limit?: number;
}

export default function UploadedDocumentsList({
    onDocumentDeleted,
    limit
}: UploadedDocumentsListProps) {
    const [documents, setDocuments] = useState<UploadedDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [documentToDelete, setDocumentToDelete] = useState<UploadedDocument | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchDocuments = async () => {
        setLoading(true);
        const result = await getUploadedDocuments();
        if (result.success) {
            const docs = limit ? result.data.slice(0, limit) : result.data;
            setDocuments(docs);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchDocuments();
    }, [limit]);

    const handleDeleteClick = (doc: UploadedDocument) => {
        setDocumentToDelete(doc);
        setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async (hardDelete: boolean) => {
        if (!documentToDelete) return;

        setDeleting(true);
        const result = await deleteDocument(documentToDelete.id, hardDelete);

        if (result.success) {
            toast.success(
                hardDelete
                    ? `Deleted document and ${result.data.deletedTransactions} transactions`
                    : 'Document removed from list'
            );
            setDeleteModalOpen(false);
            setDocumentToDelete(null);
            await fetchDocuments();
            onDocumentDeleted?.();
        } else {
            toast.error('Failed to delete document');
        }
        setDeleting(false);
    };

    const getFileTypeIcon = (fileType: string) => {
        switch (fileType) {
            case 'pdf':
                return <FileText size={20} className="text-rose-400" />;
            case 'csv':
                return <FileSpreadsheet size={20} className="text-emerald-400" />;
            case 'xlsx':
            case 'xls':
                return <FileSpreadsheet size={20} className="text-green-400" />;
            case 'screenshot':
            case 'image':
                return <FileImage size={20} className="text-violet-400" />;
            default:
                return <File size={20} className="text-slate-400" />;
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (documents.length === 0) {
        return (
            <div className="text-center py-8 border-2 border-dashed border-[var(--border-glass)] rounded-xl">
                <FileText className="mx-auto mb-2 text-muted" size={32} />
                <p className="text-sm text-muted">No documents uploaded yet</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-3">
                {documents.map(doc => (
                    <div
                        key={doc.id}
                        className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-glass)] flex items-center justify-between group hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-slate-800/50 rounded-lg">
                                {getFileTypeIcon(doc.file_type)}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white truncate max-w-[300px]">
                                    {doc.filename}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                    <span className="flex items-center gap-1">
                                        <Calendar size={12} />
                                        {formatDate(doc.upload_date)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Hash size={12} />
                                        {doc.transaction_count} tx
                                    </span>
                                    {doc.spender && (
                                        <SpenderBadge spender={doc.spender} size="sm" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => handleDeleteClick(doc)}
                            className="opacity-0 group-hover:opacity-100 p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Delete document and transactions"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <AlertTriangle className="text-amber-500" size={20} />
                            Delete Document
                        </DialogTitle>
                    </DialogHeader>

                    {documentToDelete && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-300">
                                Are you sure you want to delete:
                            </p>
                            <p className="text-sm font-medium text-white bg-slate-800 px-3 py-2 rounded-lg truncate">
                                {documentToDelete.filename}
                            </p>
                            <p className="text-xs text-slate-400">
                                This will affect <strong className="text-white">{documentToDelete.transaction_count}</strong> transactions.
                            </p>

                            <div className="space-y-2 pt-2">
                                <button
                                    onClick={() => handleConfirmDelete(true)}
                                    disabled={deleting}
                                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    {deleting ? 'Deleting...' : 'Delete Document & All Transactions'}
                                </button>
                                <button
                                    onClick={() => handleConfirmDelete(false)}
                                    disabled={deleting}
                                    className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    Keep Transactions, Remove from List
                                </button>
                                <button
                                    onClick={() => setDeleteModalOpen(false)}
                                    disabled={deleting}
                                    className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
