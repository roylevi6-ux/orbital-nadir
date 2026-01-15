export interface RawTransaction {
    date: string;
    description: string;
    amount: number | string;
    currency?: string;
    originalRow: Record<string, any>;
}

export interface ParsedTransaction {
    id?: string; // Generated on frontend for keying
    date: string; // ISO string YYYY-MM-DD
    merchant_raw: string; // Original description
    merchant_normalized?: string; // To be filled by AI/Rules later
    amount: number;
    currency: 'ILS' | 'USD' | 'EUR';
    type: 'expense' | 'income';
    is_reimbursement?: boolean; // New field for logic
    status: 'pending' | 'valid' | 'error';
    is_installment?: boolean;
    installment_info?: {
        current?: number;
        total?: number;
    };
    validationError?: string;
}

export interface ParseResult {
    fileName: string;
    transactions: ParsedTransaction[];
    totalRows: number;
    validRows: number;
    errorRows: number;
    sourceType: 'csv' | 'excel' | 'pdf' | 'screenshot';
}

export interface ColumnMapping {
    date: string;
    description: string;
    amount: string;     // Can be a single column (positive/negative)
    amount_billing?: string; // Specific for CC
    amount_transaction?: string; // Specific for CC
    credit?: string;    // If separate credit column
    debit?: string;     // If separate debit column
}
