/**
 * Installment payment information
 */
export interface InstallmentInfo {
    current_payment?: number;
    total_payments?: number;
    total?: number; // Alias for total_payments (used in some parsers)
    monthly_amount?: number;
    original_amount?: number;
    start_date?: string;
    end_date?: string;
}

export interface ColumnMapping {
    date: string; // Header Name
    description: string;
    amount: string;
    amount_billing?: string; // Billing amount
    amount_transaction?: string; // Original transaction amount
    credit?: string;
    debit?: string;
    balance?: string;
    originalRow: Record<string, string | number | boolean | null>;
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
    installment_info?: InstallmentInfo | null;
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
