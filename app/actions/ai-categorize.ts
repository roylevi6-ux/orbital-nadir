'use server';

import { createClient } from '@/lib/auth/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';

export type AIResult = {
    count: number;
    details?: string;
    error?: string;
};

// Helper: Fuzzy match merchant names (e.g., "Shufersal Ramat Gan" matches "Shufersal")
function fuzzyMatchMerchant(merchantRaw: string, memoryMerchant: string): boolean {
    const rawLower = merchantRaw.toLowerCase().trim();
    const memoryLower = memoryMerchant.toLowerCase().trim();

    // Exact match
    if (rawLower === memoryLower) return true;

    // Raw contains memory (e.g., "Shufersal Deal Ramat Gan" contains "Shufersal")
    if (rawLower.includes(memoryLower)) return true;

    // Memory contains raw (less common but possible)
    if (memoryLower.includes(rawLower)) return true;

    // Token-based match: if first significant word matches
    const rawTokens = rawLower.split(/\s+/).filter(t => t.length > 2);
    const memoryTokens = memoryLower.split(/\s+/).filter(t => t.length > 2);
    if (rawTokens[0] && memoryTokens[0] && rawTokens[0] === memoryTokens[0]) return true;

    return false;
}

// Helper: Split array into chunks for parallel processing
function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

export async function aiCategorizeTransactions(): Promise<AIResult> {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    logger.debug('[AI-Categorize] User:', user?.id, user?.email);

    let householdId: string | null = null;

    if (!authError && user) {
        // Get household from user profile
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('household_id')
            .eq('id', user.id)
            .single();
        householdId = profile?.household_id || null;
        logger.debug('[AI-Categorize] Found household from profile:', householdId);
    }

    // Fallback: If no household found, get the first household with pending transactions
    if (!householdId) {
        const { createClient: createAdmin } = require('@supabase/supabase-js');
        const adminClient = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { data: tx } = await adminClient
            .from('transactions')
            .select('household_id')
            .eq('status', 'pending')
            .limit(1)
            .single();
        householdId = tx?.household_id || null;
        logger.debug('[AI-Categorize] Fallback household from pending tx:', householdId);
    }

    if (!householdId) return { count: 0, error: 'No household found' };

    // 0. Fetch Merchant Memory (Learning) - for pre-filtering
    const { data: memory } = await supabase
        .from('merchant_memory')
        .select('merchant_normalized, category')
        .eq('household_id', householdId);

    const memoryMap = new Map<string, string>();
    if (memory && memory.length > 0) {
        for (const m of memory) {
            if (m.merchant_normalized && m.category) {
                memoryMap.set(m.merchant_normalized.toLowerCase(), m.category);
            }
        }
    }

    // 1. Fetch Categories for Context
    const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('name_english, name_hebrew, keywords');

    if (catError || !categories || categories.length === 0) {
        console.error('Category Fetch Error', catError);
        return { count: 0, error: 'Failed to fetch categories list from DB.' };
    }

    const validCategories = categories.filter(c => c.name_english);
    const categoriesContext = validCategories.map(c => {
        const kws = c.keywords && Array.isArray(c.keywords) ? c.keywords.join(', ') : '';
        return `${c.name_english} / ${c.name_hebrew} (Keywords: ${kws})`;
    }).join('\n- ');
    const allowedCategoryNames = new Set(validCategories.map(c => c.name_english));

    // 2. Fetch Pending Transactions (increased to 100 for better throughput)
    const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, merchant_normalized, amount, currency, category, category_confidence')
        .eq('household_id', householdId)
        .eq('status', 'pending')
        .limit(100);

    logger.debug(`[AI-Categorize] Fetched ${transactions?.length || 0} pending transactions`);
    if (txError) logger.error('[AI-Categorize] Query error:', txError);

    if (!transactions || transactions.length === 0) {
        return { count: 0, details: 'No pending transactions found.' };
    }

    // ============================================
    // OPTIMIZATION: Pre-filter memory matches
    // Skip AI for transactions we already know
    // ============================================
    const instantUpdates: Array<{
        id: string;
        category: string;
        merchant_normalized: string;
        status: string;
        confidence_score: number;
    }> = [];
    const needsAI: typeof transactions = [];

    for (const tx of transactions) {
        const merchantToCheck = tx.merchant_normalized || tx.merchant_raw;
        let matchedCategory: string | null = null;

        // Check for fuzzy match in memory
        for (const [memMerchant, memCategory] of memoryMap.entries()) {
            if (fuzzyMatchMerchant(merchantToCheck, memMerchant)) {
                matchedCategory = memCategory;
                break;
            }
        }

        if (matchedCategory && allowedCategoryNames.has(matchedCategory)) {
            // Instant categorization from memory - no AI needed!
            instantUpdates.push({
                id: tx.id,
                category: matchedCategory,
                merchant_normalized: tx.merchant_normalized || tx.merchant_raw,
                status: 'verified', // Changed from 'verified_by_ai' to match DB constraint
                confidence_score: 100 // Memory match = 100% confidence
            });
        } else {
            needsAI.push(tx);
        }
    }

    logger.debug(`[AI-Categorize] Memory pre-filter: ${instantUpdates.length} instant, ${needsAI.length} need AI`);

    // ============================================
    // AI Processing (only for unknown merchants)
    // ============================================
    let aiUpdates: typeof instantUpdates = [];

    if (needsAI.length > 0) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return { count: instantUpdates.length, error: 'Missing GEMINI_API_KEY (processed memory matches only)' };

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Build memory context for AI prompt
        const memoryContext = memory && memory.length > 0
            ? memory.map(m => `"${m.merchant_normalized}" -> "${m.category}"`).join('\n    ')
            : '(No learned patterns yet)';

        // ============================================
        // OPTIMIZATION: Parallel AI calls for large batches
        // ============================================
        const CHUNK_SIZE = 50; // Optimal chunk size for AI
        const chunks = needsAI.length > CHUNK_SIZE ? chunkArray(needsAI, CHUNK_SIZE) : [needsAI];

        const processChunk = async (chunk: typeof needsAI): Promise<typeof aiUpdates> => {
            const transactionLines = chunk.map(t =>
                `ID: ${t.id} | Date: ${t.date} | Merchant: "${t.merchant_raw}" | Amount: ${t.amount} ${t.currency}`
            ).join('\n');

            const systemPrompt = `
You are the Intake AI for a household finance app.
Your goal: Normalize merchant names and categorize transactions.

--- VALID CATEGORIES (Use ONLY these names) ---
- ${categoriesContext}

--- NORMALIZATION RULES ---
1. Remove branch info (e.g., "McDonalds Tel Aviv" -> "McDonalds")
2. Remove prefixes (e.g., "PAYPAL *SPOTIFY" -> "SPOTIFY")
3. Clean punctuation and spacing.

--- HOUSEHOLD MEMORY (Prioritize these) ---
${memoryContext}

--- MATCHING LOGIC ---
1. Memory Match -> Confidence 95-100%
2. Keyword Match -> Confidence 90%
3. Strong Semantic Match -> Confidence 80-90%
4. Weak/Guess -> Confidence <70%
5. Unknown -> null for category

--- OUTPUT FORMAT ---
Return ONLY a raw JSON array. No markdown.
[{"id":"uuid","merchant_normalized":"Clean Name","category":"Category OR null","confidence":0-100,"suggestions":["Cat1","Cat2","Cat3"]}]

--- INPUT ---
${transactionLines}`;

            try {
                const aiStartTime = Date.now();
                const result = await model.generateContent(systemPrompt);
                const text = result.response.text();
                logger.debug(`[AI-Categorize] Chunk of ${chunk.length} processed in ${Date.now() - aiStartTime}ms`);

                // Parse response
                const stripMarkdown = (str: string) => str.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
                let jsonResponse = stripMarkdown(text);

                try {
                    JSON.parse(jsonResponse);
                } catch {
                    const jsonMatch = text.match(/\[[\s\S]*\]/);
                    if (jsonMatch) jsonResponse = jsonMatch[0];
                    else return [];
                }

                const rawData = JSON.parse(jsonResponse);
                if (!Array.isArray(rawData)) return [];

                const chunkUpdates: typeof aiUpdates = [];
                for (const item of rawData) {
                    if (!chunk.find(t => t.id === item.id)) continue;

                    let finalCategory = item.category;
                    if (finalCategory) {
                        if (!allowedCategoryNames.has(finalCategory)) {
                            // Try to match partial (e.g., "Transportation / תחבורה")
                            for (const allowed of allowedCategoryNames) {
                                if (finalCategory.startsWith(allowed)) {
                                    finalCategory = allowed;
                                    break;
                                }
                            }
                            if (!allowedCategoryNames.has(finalCategory)) finalCategory = null;
                        }
                    }

                    const conf = typeof item.confidence === 'number' ? item.confidence : 0;

                    chunkUpdates.push({
                        id: item.id,
                        category: finalCategory || '',
                        merchant_normalized: item.merchant_normalized || '',
                        // 'verified' for high-confidence, 'flagged' for low-confidence (matches DB constraint)
                        status: finalCategory && conf >= 70 ? 'verified' : 'flagged',
                        confidence_score: conf
                    });
                }
                return chunkUpdates;
            } catch (err: unknown) {
                logger.error('[AI-Categorize] Chunk error:', err instanceof Error ? err.message : err);
                return [];
            }
        };

        // Process chunks in parallel if multiple
        if (chunks.length > 1) {
            logger.debug(`[AI-Categorize] Processing ${chunks.length} chunks in parallel...`);
            const chunkResults = await Promise.all(chunks.map(processChunk));
            aiUpdates = chunkResults.flat();
        } else {
            aiUpdates = await processChunk(chunks[0]);
        }
    }

    // ============================================
    // OPTIMIZATION: Single bulk SQL update
    // ============================================
    const allUpdates = [...instantUpdates, ...aiUpdates];

    if (allUpdates.length === 0) {
        return { count: 0, details: 'No updates to apply' };
    }

    const { createClient: createAdmin } = require('@supabase/supabase-js');
    const adminClient = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const dbStartTime = Date.now();
    let successCount = 0;

    // Try using the bulk update RPC function first
    try {
        const { data: rpcResult, error: rpcError } = await adminClient.rpc('bulk_update_transactions', {
            updates: allUpdates.map(u => ({
                id: u.id,
                category: u.category || null,
                merchant_normalized: u.merchant_normalized || null,
                status: u.status,
                confidence_score: u.confidence_score
            }))
        });

        if (rpcError) {
            logger.warn('[AI-Categorize] RPC bulk update failed, falling back to individual updates:', rpcError.message);
            throw new Error('RPC failed');
        }

        successCount = typeof rpcResult === 'number' ? rpcResult : allUpdates.length;
        logger.debug(`[AI-Categorize] Bulk RPC update completed in ${Date.now() - dbStartTime}ms - ${successCount} rows`);
    } catch {
        // Fallback: Individual updates with Promise.all
        logger.debug('[AI-Categorize] Using fallback individual updates...');
        const results = await Promise.all(
            allUpdates.map(update => {
                const payload: Record<string, unknown> = {
                    status: update.status,
                    category_confidence: update.confidence_score
                };
                if (update.category) payload.category = update.category;
                if (update.merchant_normalized) payload.merchant_normalized = update.merchant_normalized;

                return adminClient
                    .from('transactions')
                    .update(payload)
                    .eq('id', update.id)
                    .then(({ error }: { error: unknown }) => !error);
            })
        );
        successCount = results.filter(Boolean).length;
        logger.debug(`[AI-Categorize] Fallback updates completed in ${Date.now() - dbStartTime}ms - ${successCount}/${allUpdates.length}`);
    }

    const details = `Processed ${transactions.length} items: ${instantUpdates.length} from memory, ${aiUpdates.length} from AI, ${successCount} updated`;
    return { count: successCount, details };
}
