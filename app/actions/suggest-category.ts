'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCategoryNames } from '@/app/actions/review-transaction';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function suggestCategory(merchantName: string, amount: number, currency: string = 'ILS'): Promise<string[]> {
    if (!merchantName) return [];

    try {
        // 1. Get Categories Context
        const [incomeCats, expenseCats] = await Promise.all([
            getCategoryNames('income'),
            getCategoryNames('expense')
        ]);
        const allCategories = [...(incomeCats || []), ...(expenseCats || [])];
        const categoriesContext = allCategories.join(', ');

        // 2. Simple Prompt
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
        Context: Personal Finance App.
        Task: Suggest the 3 most likely categories for a transaction.
        
        Merchant: "${merchantName}"
        Amount: ${amount} ${currency}
        
        Valid Categories: ${categoriesContext}
        
        Output: JSON array of 3 strings. Example: ["Food", "Groceries", "Restaurants"].
        Return ONLY valid categories from the list if possible, or common sense ones if not found.
        `;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const suggestions = JSON.parse(text);
            if (Array.isArray(suggestions)) {
                return suggestions.slice(0, 3);
            }
        } catch (e) {
            console.error('Failed to parse AI suggestion', text);
        }

        return [];
    } catch (error) {
        console.error('AI Suggestion Error:', error);
        return [];
    }
}
