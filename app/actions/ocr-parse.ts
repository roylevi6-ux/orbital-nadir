'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Response type for extracted transactions
export interface ExtractedP2PTransaction {
    date: string;
    merchant: string;
    amount: number;
    direction: 'sent' | 'received';
    type: 'expense' | 'income';
    needs_classification: boolean;
    // New P2P-specific fields
    p2p_counterparty: string;
    p2p_memo?: string;
}

export async function detectTransactionsFromImage(imageBase64: string): Promise<ExtractedP2PTransaction[]> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `
        Analyze this screenshot of a payment app transaction list (like BIT, Paybox, or Bank App).
        Extract all visible transactions into a JSON array.

        For each transaction, extract:
        - date: String (Format normalized to YYYY-MM-DD. Use current year 2026 if missing, or infer from context. Hebrew months: 'ינו' = Jan, 'פבר' = Feb, 'מרץ' = Mar, 'אפר' = Apr, 'מאי' = May, 'יונ' = Jun, 'יול' = Jul, 'אוג' = Aug, 'ספט' = Sep, 'אוק' = Oct, 'נוב' = Nov, 'דצמ' = Dec).
        - merchant: String (The person name or company or description shown - this is the display name).
        - amount: Number (Positive value, no currency symbol).
        - direction: 'sent' or 'received'. Look for arrows (← or →), Hebrew text like 'שליחה'/'שלחת'/'קבלה'/'קיבלת', colors (red=sent, green=received), or context.
        - type: 'expense' (if direction is 'sent') or 'income' (if direction is 'received').
        - needs_classification: Boolean. Set to TRUE if direction is 'received', FALSE otherwise.
        - p2p_counterparty: String (The PERSON or BUSINESS name. Same as merchant for P2P apps. Extract the actual name like "יוסי כהן" or "פיצה האט").
        - p2p_memo: String or null (Any memo/note/comment visible for the transaction. Look for small text below the amount or name. Hebrew memos are common. Include emojis if present like 🍕).

        IMPORTANT:
        - p2p_counterparty should be the human-readable name of who you paid or who paid you
        - p2p_memo is the optional message/note attached to the payment (may be empty)
        - Preserve Hebrew text exactly as shown
        - Preserve emojis in memos

        Return ONLY the raw JSON array. No markdown, no code blocks.
        Example: [{"date": "2026-01-15", "merchant": "יוסי כהן", "amount": 80, "direction": "sent", "type": "expense", "needs_classification": false, "p2p_counterparty": "יוסי כהן", "p2p_memo": "🍕 פיצה ערב שישי"}]
        `;

        // Strip header if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg",
                },
            },
        ]);

        const response = result.response;
        const text = response.text().trim();

        // Clean markdown code blocks if Gemini returns them
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        logger.info('[OCR Parse] Raw response:', cleanText.substring(0, 500));

        const parsed = JSON.parse(cleanText);

        // Ensure all required P2P fields are present
        return parsed.map((tx: Record<string, unknown>) => ({
            date: tx.date || '',
            merchant: tx.merchant || tx.p2p_counterparty || 'Unknown',
            amount: typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0,
            direction: tx.direction === 'received' ? 'received' : 'sent',
            type: tx.direction === 'received' ? 'income' : 'expense',
            needs_classification: tx.direction === 'received',
            p2p_counterparty: tx.p2p_counterparty || tx.merchant || 'Unknown',
            p2p_memo: tx.p2p_memo || null
        }));
    } catch (error) {
        logger.error('[OCR Parse] Error:', error);
        throw new Error('Failed to extract transactions from image');
    }
}
