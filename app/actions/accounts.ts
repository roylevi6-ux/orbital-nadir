'use server';

import { createClient } from '@/lib/auth/server';

export type AccountType = 'savings' | 'checking' | 'investment' | 'retirement' | 'crypto' | 'other';

export type Account = {
    id: string;
    name: string;
    type: AccountType;
    balance: number;
    currency: string;
    institution: string | null;
    is_archived: boolean;
    updated_at: string;
};

export type AccountHistory = {
    id: string;
    balance: number;
    balance_ils: number;
    exchange_rate: number;
    date: string;
    note: string | null;
};

export type Goal = {
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    target_date: string | null;
};

async function fetchExchangeRate(from: string, to: string = 'ILS'): Promise<number> {
    if (from === to) return 1;
    try {
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`, { next: { revalidate: 3600 } });
        const data = await res.json();
        return data.rates[to] || 1;
    } catch (e) {
        console.error('Failed to fetch exchange rate', e);
        return 1; // Fallback to 1:1 if fails, user might need to correct manually later
    }
}

export async function getAccounts(): Promise<{ accounts: Account[]; netWorthILS: number }> {
    const supabase = await createClient();
    const { data: accounts, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_archived', false)
        .order('name');

    if (error) throw new Error(error.message);

    // Calculate approx net worth. 
    // Ideally we sum up the latest history 'balance_ils'. 
    // But for speed, let's fetch the latest history for each account.

    // Actually, let's just use the current balance and convert it live? 
    // No, that's slow. We should store the 'last known ILS balance' on the account table? 
    // Or just fetch the latest history entry for each account.

    // Optimization: We'll just fetch all accounts. We also need to sum them up. 
    // If we only store 'balance' (original currency) in 'accounts' table, we don't know the ILS value without a rate.
    // Let's assume we want to do a fresh conversion for the "Net Worth" display to be super accurate?
    // OR we use the last stored history value. let's fetch current rates for all currencies used.

    let totalILS = 0;
    const rates: Record<string, number> = {};

    for (const acc of accounts) {
        if (!rates[acc.currency]) {
            rates[acc.currency] = await fetchExchangeRate(acc.currency, 'ILS');
        }
        totalILS += acc.balance * rates[acc.currency];
    }

    return { accounts, netWorthILS: totalILS };
}

export async function createAccount(data: Omit<Account, 'id' | 'updated_at' | 'is_archived'>) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single();
    if (!profile) throw new Error('No profile');

    const { data: newAccount, error: accError } = await supabase.from('accounts').insert({
        household_id: profile.household_id,
        name: data.name,
        type: data.type,
        balance: data.balance,
        currency: data.currency,
        institution: data.institution
    }).select().single();

    if (accError) throw new Error(accError.message);

    // Add initial history
    await updateAccountBalance(newAccount.id, data.balance, 'Initial Balance');

    return newAccount;
}

export async function updateAccountBalance(accountId: string, newBalance: number, note?: string) {
    const supabase = await createClient();

    // 1. Get account to know currency
    const { data: account } = await supabase.from('accounts').select('currency').eq('id', accountId).single();
    if (!account) throw new Error('Account not found');

    // 2. Get Rate
    const rate = await fetchExchangeRate(account.currency, 'ILS');
    const balanceILS = newBalance * rate;

    // 3. Update Account
    await supabase.from('accounts').update({
        balance: newBalance,
        updated_at: new Date().toISOString()
    }).eq('id', accountId);

    // 4. Add History
    await supabase.from('account_history').insert({
        account_id: accountId,
        balance: newBalance,
        balance_ils: balanceILS,
        exchange_rate: rate,
        note
    });

    return { success: true };
}

export async function getNetWorthHistory(period: '1M' | '3M' | '1Y' | 'ALL' = 'ALL') {
    const supabase = await createClient();
    // This is complex. We need to sum up balances for all accounts at each point in time.
    // For V1, let's just return raw history points and let UI aggregate? 
    // No, UI needs a single line.

    // improved approach: 
    // fetch all history for all accounts.
    // Group by Day.
    // Sum balances. For days with no entry for an account, carry forward the previous known balance.

    const { data: history } = await supabase
        .from('account_history')
        .select('account_id, balance_ils, date')
        .order('date', { ascending: true });

    if (!history) return [];

    // Processing logic... (simplified for now)
    // We will do a full bucket process in JS.

    const dailyMap = new Map<string, Record<string, number>>(); // date -> { accId: balance }

    // We need to know when each account started to fill gaps properly.

    // Let's group history by date (YYYY-MM-DD)
    history.forEach(h => {
        const day = h.date.split('T')[0];
        if (!dailyMap.has(day)) dailyMap.set(day, {});
        // If multiple entries per day, last one wins (ordered by date)
        dailyMap.get(day)![h.account_id] = h.balance_ils;
    });

    // Sort days
    const sortedDays = Array.from(dailyMap.keys()).sort();

    // Carry forward
    const result = [];
    let currentBalances: Record<string, number> = {};

    for (const day of sortedDays) {
        const daysUpdates = dailyMap.get(day)!;
        currentBalances = { ...currentBalances, ...daysUpdates };

        const total = Object.values(currentBalances).reduce((sum, val) => sum + val, 0);
        result.push({ date: day, netWorth: total });
    }

    return result;
}

export async function getGoals() {
    const supabase = await createClient();
    const { data } = await supabase.from('goals').select('*').order('created_at');
    return data || [];
}
