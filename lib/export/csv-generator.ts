/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Transaction-like type for CSV export (flexible to handle different transaction types)
 */
type ExportableTransaction = {
    date: string;
    merchant_normalized?: string | null;
    merchant_raw?: string | null;
    category?: string | null;
    amount: number;
    currency?: string;
    type: string;
    notes?: string | null;
    status?: string;
    source?: string | null;
    is_duplicate?: boolean;
    [key: string]: any; // Allow other fields
};

/**
 * Convert transactions array to CSV format
 * UTF-8 encoding with BOM for Excel compatibility
 */
export function transactionsToCSV(transactions: ExportableTransaction[]): string {
    // CSV Headers
    const headers = [
        'Date',
        'Merchant',
        'Category',
        'Amount',
        'Currency',
        'Type',
        'Notes',
        'Status',
        'Source',
        'Is Duplicate'
    ];

    // Escape CSV field (handle commas, quotes, newlines)
    const escapeField = (field: any): string => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    // Build CSV rows
    const rows = transactions.map(tx => [
        escapeField(tx.date),
        escapeField(tx.merchant_normalized || tx.merchant_raw || ''),
        escapeField(tx.category || ''),
        escapeField(tx.amount),
        escapeField(tx.currency || 'ILS'),
        escapeField(tx.type),
        escapeField(tx.notes || ''),
        escapeField(tx.status || ''),
        escapeField(tx.source || ''),
        escapeField(tx.is_duplicate ? 'Yes' : 'No')
    ].join(','));

    // Combine headers and rows
    const csv = [headers.join(','), ...rows].join('\n');

    // Add BOM for Excel UTF-8 recognition
    return '\uFEFF' + csv;
}

/**
 * Trigger browser download of CSV file
 */
export function downloadCSV(csvContent: string, filename: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
}

/**
 * Generate filename for export
 */
export function generateExportFilename(prefix: string = 'transactions', extension: string = 'csv'): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `${prefix}_${date}.${extension}`;
}
