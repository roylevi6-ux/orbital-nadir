/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ColumnMapping {
    date: string; // Header Name
    description: string;
    amount: string;
    amount_billing?: string; // Billing amount
    amount_transaction?: string; // Original transaction amount
    credit?: string;
    debit?: string;
    balance?: string;
    originalRow: Record<string, any>;
}

export interface ParsedTransaction {
    id?: string; // Generated on frontend for keying
    date: string; // ISO string YYYY-MM-DD
    merchant_raw: string; // Original description
    merchant_normalized?: string; // Cleaned merchant name
    amount: number;
    currency: string; // 'ILS', 'USD', 'EUR'
    type: 'income' | 'expense';
    category?: string;
    notes?: string;
    status: 'pending' | 'categorized' | 'skipped' | 'verified';
    confidence?: number; // 0-1
    ai_suggestions?: string[]; // Candidate categories
    is_reimbursement?: boolean;
    is_installment?: boolean;
    installment_info?: any; // JSONb structure
}

// Common interface for all parsing strategies
export interface ParsingStrategy {
    name: string;
    description: string;
    parse: (file: File) => Promise<ParseResult>;
}

export interface ParseResult {
    fileName: string;
    transactions: ParsedTransaction[];
    totalRows: number;
    validRows: number;
    errorRows: number;
    sourceType: string;
}
