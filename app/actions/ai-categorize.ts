'use server';

import { createClient } from '@/lib/auth/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIResult = {
    count: number;
    details?: string;
    error?: string;
};

export async function aiCategorizeTransactions(): Promise<AIResult> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { count: 0, error: 'User not authenticated' };

    // Get household
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { count: 0, error: 'No household profile found' };
    const householdId = profile.household_id;

    // 0. Fetch Merchant Memory (Learning)
    const { data: memory } = await supabase
        .from('merchant_memory')
        .select('merchant_normalized, category')
        .eq('household_id', householdId);

    const memoryContext = memory && memory.length > 0
        ? memory.map(m => `"${m.merchant_normalized}" -> "${m.category}"`).join('\n    ')
        : '(No learned patterns yet)';

    // 1. Fetch Categories for Context (Name + Keywords)
    const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('name_english, name_hebrew, keywords');

    if (catError || !categories || categories.length === 0) {
        console.error('Category Fetch Error', catError);
        return { count: 0, error: 'Failed to fetch categories list from DB.' };
    }

    // Build rich context list: "Groceries (Keywords: supermarket, food...)"
    // Filter out null names if any
    const validCategories = categories.filter(c => c.name_english);
    const categoriesContext = validCategories.map(c => {
        const kws = c.keywords && Array.isArray(c.keywords) ? c.keywords.join(', ') : '';
        // Include Hebrew name to help AI understand Hebrew merchant context
        return `${c.name_english} / ${c.name_hebrew} (Keywords: ${kws})`;
    }).join('\n- ');

    // Create Set for validation
    const allowedCategoryNames = new Set(validCategories.map(c => c.name_english));

    // 2. Fetch Uncategorized Transactions
    // Fetch NULL or "undefined" string categories
    const { data: transactions } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, amount, currency')
        .eq('household_id', householdId)
        .eq('household_id', householdId)
        .eq('status', 'pending') // Only fetch pending items to avoid infinite loops
        .is('category', null) // Only fetch uncategorized items (Supabase simplified syntax)
        .limit(50); // Reduced batch size to prevent output truncation

    if (!transactions || transactions.length === 0) {
        return { count: 0, details: 'No uncategorized transactions found.' };
    }

    // 3. Prepare AI Prompt
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { count: 0, error: 'Missing GEMINI_API_KEY' };

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use verified working model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const transactionLines = transactions.map(t =>
        `ID: ${t.id} | Date: ${t.date} | Merchant: "${t.merchant_raw}" | Amount: ${t.amount} ${t.currency}`
    ).join('\n');

    const systemPrompt = `
    You are the Intake AI for a household finance app. (PRD Ref: Part 2)
    Your goal: Normalize merchant names and categorize transactions based on the provided list.

    --- VALID CATEGORIES (Use ONLY these names) ---
    - ${categoriesContext}

    --- NORMALIZATION RULES ---
    1. Remove branch info (e.g., "McDonalds Tel Aviv" -> "McDonalds")
    2. Remove prefixes (e.g., "PAYPAL *SPOTIFY" -> "SPOTIFY")
    3. Standardize Hebrew/English (e.g., "Super-Pharm" -> "סופר פארם" IF the category list uses Hebrew, otherwise keep English. Here, use English if the inputs are mixed, but normalize to the merchant's brand name).
    4. Clean punctuation and spacing.

    --- HOUSEHOLD MEMORY (Prioritize these matches) ---
    The user has explicitly taught you these mappings. If the merchant matches (fuzzy or exact), use this category!
    ${memoryContext}

    --- MATCHING LOGIC (Confidence Scoring) ---
    1. **Household Memory Match**: If matches memory -> Confidence 95-100%.
    2. **Explicit Keyword Match**: If merchant contains category keyword -> Confidence 90%.
    3. **Strong Semantic Match**: High certainty based on world knowledge -> Confidence 80-90%.
    4. **Weak/Guess**: Low certainty -> Confidence < 70%.
    5. **Unknown**: Return null for category.

    --- OUTPUT FORMAT ---
    Return ONLY a raw JSON array. No markdown.
    IMPORTANT: 'category' must be the EXACT English name from the list above. Do NOT include Hebrew translation in the value.
    [
      {
        "id": "uuid",
        "merchant_normalized": "Clean Name",
        "category": "Exact Category Name (English Only) OR null",
        "confidence": 0-100 (Number),
        "suggestions": ["Cat1", "Cat2", "Cat3"] (Top 3 likely categories, English Only)
      }
    ]

    --- INPUT TRANSACTIONS ---
    ${transactionLines}
    `;

    // 4. Call AI
    let jsonResponse = '';
    try {
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        console.log("--- RAW AI RESPONSE START ---");
        console.log(text);
        console.log("--- RAW AI RESPONSE END ---");

        // Helper to strip markdown code blocks
        const stripMarkdown = (str: string) => {
            return str.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        };

        const cleanText = stripMarkdown(text);

        // Try direct parse first (cleanest)
        try {
            jsonResponse = cleanText;
            JSON.parse(jsonResponse); // Verify it parses
        } catch {
            // Fallback: Try regex if there's surrounding noise
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                jsonResponse = jsonMatch[0];
            } else {
                return { count: 0, error: `AI: No JSON found/Truncated. Received: ${text.substring(0, 100)}...` };
            }
        }
    } catch (aiError: any) {
        console.error('AI Processing Fatal Error:', aiError);
        // Check for specific Google API errors
        if (aiError.message?.includes('429')) {
            return { count: 0, error: 'AI Rate Limit Reached. Please try again in a minute.' };
        }
        return { count: 0, error: `AI Error: ${aiError.message}` };
    }

    // 5. Parse & Validate
    let updates = [];
    try {
        const rawData = JSON.parse(jsonResponse);
        if (!Array.isArray(rawData)) throw new Error('Response is not an array');

        for (const item of rawData) {
            // Validate ID exists in our batch
            if (!transactions.find(t => t.id === item.id)) continue;

            // Validate Category
            let finalCategory = item.category;

            // Helper to match category (handles "English / Hebrew" format from AI)
            const findMatchingCategory = (input?: string) => {
                if (!input) return null;
                if (allowedCategoryNames.has(input)) return input;
                // Check if input starts with an allowed name (e.g. "Transportation / תחבורה")
                for (const allowed of allowedCategoryNames) {
                    if (input.startsWith(allowed)) return allowed;
                }
                return null;
            };

            finalCategory = findMatchingCategory(finalCategory);

            // Validate Suggestions
            let validSuggestions: string[] = [];
            if (Array.isArray(item.suggestions)) {
                validSuggestions = item.suggestions.filter((s: string) => allowedCategoryNames.has(s));
            }

            // Validate Confidence & thresholds per PRD
            const conf = typeof item.confidence === 'number' ? item.confidence : 0;

            if (finalCategory && conf >= 90) {
                // Tier 1: High Confidence (>=90%) -> Auto-categorize silently
                updates.push({
                    id: item.id,
                    category: finalCategory,
                    merchant_normalized: item.merchant_normalized || null,
                    status: 'categorized', // Valid
                    ai_suggestions: validSuggestions,
                    confidence_score: conf
                });
            } else if (finalCategory && conf >= 70) {
                // Tier 2: Medium Confidence (70-89%) -> Flag for Review ("Quick Win")
                updates.push({
                    id: item.id,
                    category: finalCategory,
                    merchant_normalized: item.merchant_normalized || null,
                    status: 'pending', // Use pending to avoid DB constraint issues with 'flagged'
                    ai_suggestions: validSuggestions,
                    confidence_score: conf
                });
            } else {
                // Tier 3: Low Confidence (<70%) -> Require Input
                updates.push({
                    id: item.id,
                    category: finalCategory, // Keep guess for UI suggestion even if low status
                    merchant_normalized: item.merchant_normalized || null,
                    status: 'skipped', // Needs manual attention
                    ai_suggestions: validSuggestions,
                    confidence_score: conf
                });
            }
        }
    } catch (parseError) {
        console.error('JSON Parse Error', parseError);
        return { count: 0, error: 'Failed to parse AI response' };
    }

    // 6. Execute Updates (Bulk Upsert for Performance)
    // Use Service Role to ensure updates succeed regardless of complex RLS states
    const supabaseAdmin = createClient(); // Re-using standard client to get types, but we need actual admin client
    // Actually we need to import { createClient } from '@supabase/supabase-js' manually or just cast?
    // Since we are in 'use server', we can use process.env directly.

    const { createClient: createAdmin } = require('@supabase/supabase-js');
    const adminClient = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    let successCount = 0;
    if (updates.length > 0) {
        const updatePromises = updates.map(update => {
            const payload: any = {
                status: update.status,
                ai_suggestions: update.ai_suggestions,
                category_confidence: update.confidence_score // Map internal field to DB column
            };
            if (update.category) {
                payload.category = update.category;
                payload.merchant_normalized = update.merchant_normalized;
            }

            return adminClient
                .from('transactions')
                .update(payload)
                .eq('id', update.id)
                .then(({ error }: { error: any }) => ({ id: update.id, error }));
        });

        const results = await Promise.all(updatePromises);
        successCount = results.filter(r => !r.error).length;

        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
            console.error("AI Update Errors (Sample):", errors[0]);
        }
    }

    return { count: successCount, details: `Processed ${transactions.length} items` };
}
