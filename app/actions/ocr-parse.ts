'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function detectTransactionsFromImage(imageBase64: string): Promise<any[]> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `
        Analyze this screenshot of a payment app transaction list (like BIT, Paybox, or Bank App).
        Extract all visible transactions into a JSON array.
        
        For each transaction, extract:
        - date: String (Format normalized to YYYY-MM-DD. Use current year if missing, or infer from context. Hebrew months like 'ינו' = Jan).
        - merchant: String (The person name or company or description shown).
        - amount: Number (Positive value).
        - direction: 'sent' or 'received'. Look for arrows, Hebrew text like 'שליחה'/'קבלה', or colors.
        - type: 'expense' (if direction is 'sent') or 'income' (if direction is 'received').
        - needs_classification: Boolean. Set to TRUE if direction is 'received', FALSE otherwise. (Received money needs user to classify as Income vs Reimbursement)
        
        Return ONLY the raw JSON array. No markdown, no code blocks.
        Example: [{"date": "2024-01-15", "merchant": "Pizza Hut", "amount": 80, "direction": "sent", "type": "expense", "needs_classification": false}]
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
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '');

        return JSON.parse(cleanText);
    } catch (error) {
        console.error('OCR Error:', error);
        throw new Error('Failed to extract transactions from image');
    }
}
