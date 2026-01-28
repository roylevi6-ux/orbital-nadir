/**
 * Types for email receipt parsing and matching
 */

/**
 * A line item from a receipt (product/service purchased)
 */
export interface ReceiptItem {
    name: string;
    quantity?: number;
    price?: number;
}

/**
 * Result of AI parsing an email for receipt data
 */
export interface ParsedReceipt {
    /** Whether this email is actually a purchase receipt */
    is_receipt: boolean;
    /** Clean merchant/vendor name (e.g., "Spotify" not "PAYPAL *SPOTIFY") */
    merchant_name: string | null;
    /** Total amount paid */
    amount: number | null;
    /** Currency code (ILS, USD, EUR, etc.) */
    currency: string;
    /** Date of purchase in YYYY-MM-DD format */
    receipt_date: string | null;
    /** List of items/products purchased */
    items: ReceiptItem[];
    /** AI confidence in the parsing (0-100) */
    confidence: number;
}

/**
 * Email receipt stored in database
 */
export interface EmailReceipt {
    id: string;
    household_id: string;
    sender_email: string;
    raw_subject: string | null;
    received_at: string;
    merchant_name: string | null;
    amount: number | null;
    currency: string;
    receipt_date: string | null;
    items: ReceiptItem[];
    is_receipt: boolean;
    parse_confidence: number | null;
    raw_email_body: string | null;
    matched_transaction_id: string | null;
    match_confidence: number | null;
    matched_at: string | null;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

/**
 * Result of matching a receipt to a transaction
 */
export interface ReceiptMatch {
    receipt_id: string;
    transaction_id: string;
    receipt_merchant_name: string;
    receipt_items: ReceiptItem[];
    confidence: number;
    reason: string;
}

/**
 * Transaction data needed for receipt matching
 */
export interface TransactionForMatching {
    id: string;
    amount: number;
    currency: string;
    date: string;
}

/**
 * Inbound email data from Resend webhook
 */
export interface InboundEmail {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
}

/**
 * Input for storing a new receipt
 */
export interface StoreReceiptInput {
    household_id: string;
    sender_email: string;
    raw_subject: string | null;
    raw_email_body: string | null;
    is_receipt: boolean;
    merchant_name: string | null;
    amount: number | null;
    currency: string;
    receipt_date: string | null;
    items: ReceiptItem[];
    confidence: number;
}
