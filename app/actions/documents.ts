'use server';

import { withAuth, withAuthAutoProvision, ActionResult } from '@/lib/auth/context';
import { logger } from '@/lib/logger';

/**
 * Uploaded document record
 */
export interface UploadedDocument {
    id: string;
    filename: string;
    file_type: string;
    upload_date: string;
    spender: 'R' | 'N' | null;
    transaction_count: number;
    status: 'active' | 'deleted';
    deleted_at: string | null;
}

/**
 * Input for creating a new document record
 */
export interface CreateDocumentInput {
    filename: string;
    file_type: string;
    spender: 'R' | 'N' | null;
    transaction_count: number;
}

/**
 * Create a new uploaded document record.
 * Call this BEFORE saving transactions to get a document ID.
 */
export async function createDocument(
    input: CreateDocumentInput
): Promise<ActionResult<{ id: string }>> {
    return withAuthAutoProvision(async ({ supabase, householdId }) => {
        logger.info('[Documents] Creating document record:', input.filename);

        const { data, error } = await supabase
            .from('uploaded_documents')
            .insert({
                household_id: householdId,
                filename: input.filename,
                file_type: input.file_type,
                spender: input.spender,
                transaction_count: input.transaction_count
            })
            .select('id')
            .single();

        if (error) {
            logger.error('[Documents] Failed to create document:', error);
            throw new Error('Failed to create document: ' + error.message);
        }

        logger.info('[Documents] Created document:', data.id);
        return { id: data.id };
    });
}

/**
 * Get all uploaded documents for the household.
 * Returns only active (non-deleted) documents, sorted by upload date.
 */
export async function getUploadedDocuments(): Promise<ActionResult<UploadedDocument[]>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { data, error } = await supabase
            .from('uploaded_documents')
            .select('id, filename, file_type, upload_date, spender, transaction_count, status, deleted_at')
            .eq('household_id', householdId)
            .eq('status', 'active')
            .order('upload_date', { ascending: false });

        if (error) {
            logger.error('[Documents] Failed to fetch documents:', error);
            throw new Error('Failed to fetch documents: ' + error.message);
        }

        return (data || []) as UploadedDocument[];
    });
}

/**
 * Delete a document and optionally its associated transactions.
 *
 * @param documentId - The document ID to delete
 * @param hardDelete - If true, permanently delete document AND all transactions.
 *                     If false, soft-delete document and unlink transactions.
 */
export async function deleteDocument(
    documentId: string,
    hardDelete: boolean = true
): Promise<ActionResult<{ deletedTransactions: number }>> {
    return withAuth(async ({ supabase, householdId }) => {
        logger.info('[Documents] Deleting document:', { documentId, hardDelete });

        // First verify document belongs to household
        const { data: doc, error: docError } = await supabase
            .from('uploaded_documents')
            .select('id, filename')
            .eq('id', documentId)
            .eq('household_id', householdId)
            .single();

        if (docError || !doc) {
            throw new Error('Document not found');
        }

        // Count transactions that will be affected
        const { count } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('document_id', documentId)
            .eq('household_id', householdId);

        const transactionCount = count || 0;

        if (hardDelete) {
            // Hard delete: Actually remove transactions and document
            logger.info('[Documents] Hard deleting', transactionCount, 'transactions');

            // Delete transactions first (due to FK constraint)
            const { error: txError } = await supabase
                .from('transactions')
                .delete()
                .eq('document_id', documentId)
                .eq('household_id', householdId);

            if (txError) {
                logger.error('[Documents] Failed to delete transactions:', txError);
                throw new Error('Failed to delete transactions: ' + txError.message);
            }

            // Then delete the document
            const { error: docDelError } = await supabase
                .from('uploaded_documents')
                .delete()
                .eq('id', documentId)
                .eq('household_id', householdId);

            if (docDelError) {
                logger.error('[Documents] Failed to delete document:', docDelError);
                throw new Error('Failed to delete document: ' + docDelError.message);
            }

            logger.info('[Documents] Hard deleted document and', transactionCount, 'transactions');
        } else {
            // Soft delete: Mark as deleted, unlink transactions
            logger.info('[Documents] Soft deleting document, unlinking', transactionCount, 'transactions');

            // Unlink transactions (set document_id to null)
            const { error: txUpdateError } = await supabase
                .from('transactions')
                .update({ document_id: null })
                .eq('document_id', documentId)
                .eq('household_id', householdId);

            if (txUpdateError) {
                logger.error('[Documents] Failed to unlink transactions:', txUpdateError);
                throw new Error('Failed to unlink transactions: ' + txUpdateError.message);
            }

            // Mark document as deleted
            const { error: updateError } = await supabase
                .from('uploaded_documents')
                .update({
                    status: 'deleted',
                    deleted_at: new Date().toISOString(),
                    transaction_count: 0
                })
                .eq('id', documentId)
                .eq('household_id', householdId);

            if (updateError) {
                logger.error('[Documents] Failed to soft-delete document:', updateError);
                throw new Error('Failed to mark document as deleted: ' + updateError.message);
            }

            logger.info('[Documents] Soft deleted document, unlinked transactions');
        }

        return { deletedTransactions: transactionCount };
    });
}

/**
 * Update the transaction count for a document.
 * Call this after saving transactions if the count changes.
 */
export async function updateDocumentTransactionCount(
    documentId: string,
    count: number
): Promise<ActionResult<void>> {
    return withAuth(async ({ supabase, householdId }) => {
        const { error } = await supabase
            .from('uploaded_documents')
            .update({ transaction_count: count })
            .eq('id', documentId)
            .eq('household_id', householdId);

        if (error) {
            logger.error('[Documents] Failed to update transaction count:', error);
            throw new Error('Failed to update document: ' + error.message);
        }
    });
}
