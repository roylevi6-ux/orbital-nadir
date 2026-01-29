const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    // Check Google receipts and matching transactions
    console.log('=== GOOGLE RECEIPT (Jan 26) ===');
    const { data: googleReceipts } = await supabase
        .from('email_receipts')
        .select('id, merchant_name, amount, currency, receipt_date, matched_transaction_id')
        .ilike('merchant_name', '%Google%')
        .eq('receipt_date', '2026-01-26');

    for (const r of googleReceipts || []) {
        console.log('Receipt:', r.merchant_name, '|', r.amount, r.currency, '| matched:', r.matched_transaction_id || 'none');
    }

    // Check for Google transactions around that date
    console.log('\n=== GOOGLE TRANSACTIONS (Jan 24-28) ===');
    const { data: googleTxs } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, amount, currency, receipt_id')
        .ilike('merchant_raw', '%GOOGLE%')
        .gte('date', '2026-01-24')
        .lte('date', '2026-01-28');

    for (const t of googleTxs || []) {
        console.log('Tx:', t.date, '|', t.merchant_raw, '|', t.amount, t.currency, '| receipt:', t.receipt_id || 'none');
    }

    // Check Spotify
    console.log('\n=== SPOTIFY RECEIPT (Jan 20) ===');
    const { data: spotifyReceipts } = await supabase
        .from('email_receipts')
        .select('id, merchant_name, amount, currency, receipt_date, matched_transaction_id')
        .ilike('merchant_name', '%Spotify%')
        .eq('receipt_date', '2026-01-20');

    for (const r of spotifyReceipts || []) {
        console.log('Receipt:', r.merchant_name, '|', r.amount, r.currency, '| matched:', r.matched_transaction_id || 'none');
    }

    console.log('\n=== SPOTIFY TRANSACTIONS (Jan 18-22) ===');
    const { data: spotifyTxs } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, amount, currency, receipt_id')
        .ilike('merchant_raw', '%SPOTIFY%')
        .gte('date', '2026-01-18')
        .lte('date', '2026-01-22');

    for (const t of spotifyTxs || []) {
        console.log('Tx:', t.date, '|', t.merchant_raw, '|', t.amount, t.currency, '| receipt:', t.receipt_id || 'none');
    }
}

check();
