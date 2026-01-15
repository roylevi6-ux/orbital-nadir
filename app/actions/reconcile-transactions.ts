'use server';

import { createClient } from '@/lib/auth/server';
import { addDays, subDays, parseISO, isSameDay } from 'date-fns';

export interface DuplicateCandidate {
    appTransaction: {
        id: string;
        date: string;
        merchant_raw: string;
        amount: number;
        currency: string;
        type: string;
    };
    ccTransaction: {
        id: string;
        date: string;
        merchant_raw: string;
        amount: number;
        currency: string;
        type: string;
    };
    confidence: number; // 0-100
    reason: string;
}

export async function findPotentialDuplicates(): Promise<{ data: DuplicateCandidate[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'Unauthorized' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { data: [], error: 'No household' };

    // 1. Fetch "Pending/Categorized/Verified" items that are NOT already duplicates
    // We assume App transactions are identified by source (screenshots) or merchant keywords (BIT/PAYBOX)
    // Actually, identifying "App Transactions" is tricky if we don't have source type in 'transactions'.
    // But we do have 'source'. Let's assume source for screenshots contains 'screenshot'.
    // OR we detect "Send" keywords.
    // Let's assume we look for ALL transactions, but split them in memory for now to be safe.

    // Fetch ALL active transactions (expense only for now)
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', profile.household_id)
        .eq('type', 'expense')
        .is('duplicate_of', null) // Not already a child
        .order('date', { ascending: false });

    if (error || !transactions) return { data: [], error: 'Failed to fetch' };

    // Split into "App Candidates" and "CC Candidates"
    // App Candidates: from screenshot source, or merchant contains "sent to" etc.
    // CC Candidates: from excel/csv source, or merchant contains "BIT" "PAYBOX" "PEPPER"

    // Simplification: 
    // App = source contains 'screenshot' OR manual upload that looks like app
    // CC = source contains 'card' or 'bank' or 'excel'

    const appTx = transactions.filter(t =>
        t.source.toLowerCase().includes('screenshot') ||
        t.source.toLowerCase().includes('image')
    );

    const ccTx = transactions.filter(t =>
        !t.source.toLowerCase().includes('screenshot') &&
        !t.source.toLowerCase().includes('image')
    );

    const candidates: DuplicateCandidate[] = [];

    // 2. Run Matching Logic
    for (const app of appTx) {
        const appDate = parseISO(app.date);
        const appAmt = Number(app.amount);

        // Find CC match:
        // - Amount within 1 ILS
        // - Date: App Date <= CC Date <= App Date + 5 days
        // - CC Merchant contains "BIT", "PAYBOX", "PEPPER", "P.P"

        const potentialMatches = ccTx.filter(cc => {
            const ccDate = parseISO(cc.date);
            const ccAmt = Number(cc.amount);

            // Amount Check
            if (Math.abs(ccAmt - appAmt) > 1) return false;

            // Date Check (CC usually appears AFTER app)
            // Allow CC to be 1 day before (timezone/posting weirdness) to 7 days after
            const diffTime = ccDate.getTime() - appDate.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            if (diffDays < -1 || diffDays > 7) return false;

            // Keywords Check (in CC description)
            const keywords = ['BIT', 'PAYBOX', 'PEPPER', 'PAY PAL', 'P.P'];
            const ccName = cc.merchant_raw.toUpperCase();
            const hasKeyword = keywords.some(k => ccName.includes(k));

            return hasKeyword;
        });

        // If unique match found (simplest case)
        if (potentialMatches.length === 1) {
            candidates.push({
                appTransaction: {
                    id: app.id,
                    date: app.date,
                    merchant_raw: app.merchant_raw,
                    amount: appAmt,
                    currency: app.currency,
                    type: app.type
                },
                ccTransaction: {
                    id: potentialMatches[0].id,
                    date: potentialMatches[0].date,
                    merchant_raw: potentialMatches[0].merchant_raw,
                    amount: Number(potentialMatches[0].amount),
                    currency: potentialMatches[0].currency,
                    type: potentialMatches[0].type
                },
                confidence: 90,
                reason: 'Matched Amount, Date, and Keyword'
            });
        }
        // TODO: Handle multiple matches? unlikely for identical amount in same week for same bit/paybox pattern
    }

    return { data: candidates };
}

export async function mergeTransactions(appTxId: string, ccTxId: string, category?: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    // 1. Get User Profile for Security
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { success: false, error: 'No household' };

    // 2. Fetch App Transaction details (for context)
    const { data: appTx } = await supabase
        .from('transactions')
        .select('merchant_raw, category, notes, merchant_normalized')
        .eq('id', appTxId)
        .eq('household_id', profile.household_id)
        .single();

    if (!appTx) return { success: false, error: 'App transaction not found' };

    // 3. Update CC Transaction (Enhance Context)
    // We want to keep the CC financial record, but use the App's "Human" description
    // e.g. "BIT YOSSI" -> "Pizza with Yossi" (if that was in the app screenshot)

    // If App has a useful normalized merchant (not just 'BIT'), use it.
    // Otherwise use merchant_raw from app.
    const improvedMerchant = appTx.merchant_normalized || appTx.merchant_raw;
    const improvedNotes = appTx.notes || `Original: ${appTx.merchant_raw}`; // Preserve original info in notes if needed

    // Determine final category: Explicit override > App Category > Keep Existing (undefined updates nothing)
    const finalCategory = category || appTx.category;

    const { error: updateError } = await supabase
        .from('transactions')
        .update({
            merchant_normalized: improvedMerchant,
            // If we have a category, update it.
            ...(finalCategory ? { category: finalCategory } : {}),
            // Append notes
            notes: improvedNotes,
            // Mark as 'verified' or 'categorized' if we successfully merged context?
            status: 'verified' // Mark as verified since user actively reconciled it
        })
        .eq('id', ccTxId)
        .eq('household_id', profile.household_id);

    if (updateError) return { success: false, error: 'Failed to update CC transaction: ' + updateError.message };

    // 4. Mark App Transaction as Duplicate
    const { error: dupError } = await supabase
        .from('transactions')
        .update({
            is_duplicate: true,
            duplicate_of: ccTxId,
            status: 'verified' // It's resolved as a duplicate
        })
        .eq('id', appTxId)
        .eq('household_id', profile.household_id);

    if (dupError) return { success: false, error: 'Failed to mark duplicate' };

    return { success: true };
}

export async function findMonthlyDuplicates(
    year: number,
    month: number
): Promise<{ success: boolean; matches?: DuplicateCandidate[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();
    if (!profile?.household_id) return { success: false, error: 'No household' };

    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1); // month is 1-indexed
    const endDate = new Date(year, month, 0); // Last day of month

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Fetch transactions for the month
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', profile.household_id)
        .eq('type', 'expense')
        .is('duplicate_of', null)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false });

    if (error || !transactions) {
        return { success: false, error: 'Failed to fetch transactions' };
    }

    // Split into app and CC transactions
    const appTx = transactions.filter(t =>
        t.source.toLowerCase().includes('screenshot') ||
        t.source.toLowerCase().includes('image') ||
        t.source.toLowerCase().includes('bit') ||
        t.source.toLowerCase().includes('paybox')
    );

    const ccTx = transactions.filter(t =>
        !appTx.find(a => a.id === t.id) // Not already in app list
    );

    const candidates: DuplicateCandidate[] = [];

    // Run matching logic
    for (const app of appTx) {
        const appDate = parseISO(app.date);
        const appAmt = Number(app.amount);

        const potentialMatches = ccTx.filter(cc => {
            const ccDate = parseISO(cc.date);
            const ccAmt = Number(cc.amount);

            // Amount Check
            if (Math.abs(ccAmt - appAmt) > 1) return false;

            // Date Check
            const diffTime = ccDate.getTime() - appDate.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            if (diffDays < -1 || diffDays > 7) return false;

            // Keywords Check
            const keywords = ['BIT', 'PAYBOX', 'PEPPER', 'PAY PAL', 'P.P', 'PAYPAL'];
            const ccName = cc.merchant_raw.toUpperCase();
            const hasKeyword = keywords.some(k => ccName.includes(k));

            return hasKeyword;
        });

        if (potentialMatches.length === 1) {
            const match = potentialMatches[0];
            const ccDate = parseISO(match.date);
            const daysDiff = Math.floor((ccDate.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));

            // Calculate confidence based on date proximity
            let confidence = 90;
            if (daysDiff === 0 || daysDiff === 1) confidence = 95;
            if (Math.abs(Number(match.amount) - appAmt) === 0) confidence += 2;

            candidates.push({
                appTransaction: {
                    id: app.id,
                    date: app.date,
                    merchant_raw: app.merchant_raw,
                    amount: appAmt,
                    currency: app.currency,
                    type: app.type
                },
                ccTransaction: {
                    id: match.id,
                    date: match.date,
                    merchant_raw: match.merchant_raw,
                    amount: Number(match.amount),
                    currency: match.currency,
                    type: match.type
                },
                confidence: Math.min(confidence, 99),
                reason: `Matched amount, ${daysDiff} day${daysDiff !== 1 ? 's' : ''} apart, keyword found`
            });
        }
    }

    return { success: true, matches: candidates };
}

export async function reconcileTransactions(): Promise<{ success: boolean; count?: number; error?: string }> {
    const result = await findPotentialDuplicates();
    if (result.error) return { success: false, error: result.error };
    return { success: true, count: result.data.length };
}
