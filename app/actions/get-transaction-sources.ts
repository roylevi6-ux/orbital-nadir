'use server';

import { withAuth, ActionResult } from '@/lib/auth/context';
import { logger } from '@/lib/logger';

export interface SmsSource {
    type: 'sms';
    id: string;
    card_ending: string;
    merchant_name: string | null;
    amount: number;
    transaction_date: string;
    provider: string | null;
    raw_message: string;
    received_at: string;
    cc_matched: boolean;
}

export interface EmailReceiptSource {
    type: 'email_receipt';
    id: string;
    source_type: 'email' | 'sms';
    merchant_name: string | null;
    amount: number | null;
    receipt_date: string | null;
    sender_email: string | null;
    subject_line: string | null;
    extracted_items: string[] | null;
    attachments: string[] | null;
    created_at: string;
}

export interface CcSlipSource {
    type: 'cc_slip';
    source_file: string;
    source_row: number | null;
    uploaded_at: string | null;
}

export type TransactionSource = SmsSource | EmailReceiptSource | CcSlipSource;

export interface TransactionSourcesResult {
    transaction_id: string;
    sources: TransactionSource[];
    has_sms: boolean;
    has_receipt: boolean;
    has_cc_slip: boolean;
}

/**
 * Get all source attribution data for a transaction
 */
export async function getTransactionSources(
    transactionId: string
): Promise<ActionResult<TransactionSourcesResult>> {
    return withAuth(async ({ supabase, householdId }) => {
        // Fetch the transaction with its linked sources
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .select('id, sms_id, receipt_id, source_file, source_row, created_at')
            .eq('id', transactionId)
            .eq('household_id', householdId)
            .single();

        if (txError) {
            logger.error('[Sources] Failed to fetch transaction:', txError);
            throw new Error('Transaction not found');
        }

        const sources: TransactionSource[] = [];

        // Fetch SMS source if linked
        if (transaction.sms_id) {
            const { data: sms, error: smsError } = await supabase
                .from('sms_transactions')
                .select('id, card_ending, merchant_name, amount, transaction_date, provider, raw_message, received_at, cc_matched')
                .eq('id', transaction.sms_id)
                .single();

            if (!smsError && sms) {
                sources.push({
                    type: 'sms',
                    id: sms.id,
                    card_ending: sms.card_ending,
                    merchant_name: sms.merchant_name,
                    amount: sms.amount,
                    transaction_date: sms.transaction_date,
                    provider: sms.provider,
                    raw_message: sms.raw_message,
                    received_at: sms.received_at,
                    cc_matched: sms.cc_matched
                });
            }
        }

        // Fetch email receipt source - check both directions:
        // 1. transaction.receipt_id points to email_receipts
        // 2. email_receipts.matched_transaction_id points to transaction

        // Method 1: Check if transaction has receipt_id
        if (transaction.receipt_id) {
            const { data: receipt, error: receiptError } = await supabase
                .from('email_receipts')
                .select('id, source_type, merchant_name, amount, receipt_date, sender_email, subject_line, extracted_items, attachments, created_at')
                .eq('id', transaction.receipt_id)
                .eq('household_id', householdId)
                .single();

            if (!receiptError && receipt) {
                sources.push({
                    type: 'email_receipt',
                    id: receipt.id,
                    source_type: receipt.source_type || 'email',
                    merchant_name: receipt.merchant_name,
                    amount: receipt.amount,
                    receipt_date: receipt.receipt_date,
                    sender_email: receipt.sender_email,
                    subject_line: receipt.subject_line,
                    extracted_items: receipt.extracted_items,
                    attachments: receipt.attachments,
                    created_at: receipt.created_at
                });
            } else if (receiptError) {
                logger.warn('[Sources] Failed to fetch receipt by receipt_id:', receiptError.message);
            }
        }

        // Method 2: Check if any email_receipts have matched_transaction_id pointing to this transaction
        const { data: matchedReceipts, error: matchedError } = await supabase
            .from('email_receipts')
            .select('id, source_type, merchant_name, amount, receipt_date, sender_email, subject_line, extracted_items, attachments, created_at')
            .eq('matched_transaction_id', transactionId)
            .eq('household_id', householdId);

        if (matchedError) {
            logger.warn('[Sources] Failed to fetch receipts by matched_transaction_id:', matchedError.message);
        }

        if (!matchedError && matchedReceipts && matchedReceipts.length > 0) {
            for (const receipt of matchedReceipts) {
                // Don't add duplicates (in case receipt_id and matched_transaction_id both point to same receipt)
                if (!sources.some(s => s.type === 'email_receipt' && (s as EmailReceiptSource).id === receipt.id)) {
                    sources.push({
                        type: 'email_receipt',
                        id: receipt.id,
                        source_type: receipt.source_type || 'email',
                        merchant_name: receipt.merchant_name,
                        amount: receipt.amount,
                        receipt_date: receipt.receipt_date,
                        sender_email: receipt.sender_email,
                        subject_line: receipt.subject_line,
                        extracted_items: receipt.extracted_items,
                        attachments: receipt.attachments,
                        created_at: receipt.created_at
                    });
                }
            }
        }

        // Add CC slip source if has source_file
        if (transaction.source_file) {
            sources.push({
                type: 'cc_slip',
                source_file: transaction.source_file,
                source_row: transaction.source_row,
                uploaded_at: transaction.created_at
            });
        }

        // Sort sources by date (oldest first = chronological order)
        sources.sort((a, b) => {
            const dateA = a.type === 'sms' ? a.received_at :
                a.type === 'email_receipt' ? a.created_at :
                    a.uploaded_at || '';
            const dateB = b.type === 'sms' ? b.received_at :
                b.type === 'email_receipt' ? b.created_at :
                    b.uploaded_at || '';
            return new Date(dateA).getTime() - new Date(dateB).getTime();
        });

        return {
            transaction_id: transactionId,
            sources,
            has_sms: sources.some(s => s.type === 'sms'),
            has_receipt: sources.some(s => s.type === 'email_receipt'),
            has_cc_slip: sources.some(s => s.type === 'cc_slip')
        };
    });
}
