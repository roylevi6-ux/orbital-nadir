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
    // Get unmatched Electra/SuperPower receipts
    console.log('=== UNMATCHED ELECTRA/SUPERPOWER RECEIPTS ===');
    const { data: receipts } = await supabase
        .from('email_receipts')
        .select('id, merchant_name, amount, currency, receipt_date, matched_transaction_id')
        .is('matched_transaction_id', null)
        .eq('is_receipt', true)
        .or('merchant_name.ilike.%electra%,merchant_name.ilike.%superpower%')
        .order('receipt_date', { ascending: false });

    for (const r of receipts || []) {
        console.log(r.receipt_date, '|', r.merchant_name, '|', r.amount, r.currency);
    }

    // Get Electra Power transactions
    console.log('\n=== ELECTRA POWER TRANSACTIONS ===');
    const { data: txs } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, amount, currency, receipt_id')
        .ilike('merchant_raw', '%אלקטרה%')
        .order('date', { ascending: false })
        .limit(15);

    for (const t of txs || []) {
        console.log(t.date, '|', t.merchant_raw, '|', t.amount, t.currency, '| receipt:', t.receipt_id ? 'yes' : 'no');
    }

    // Check date alignment
    console.log('\n=== DATE ALIGNMENT CHECK ===');
    if (receipts && receipts.length > 0 && txs && txs.length > 0) {
        for (const r of receipts.slice(0, 5)) {
            console.log('\nReceipt:', r.receipt_date, r.merchant_name, r.amount);
            // Find transactions within 2 days
            const receiptDate = new Date(r.receipt_date);
            for (const t of txs) {
                const txDate = new Date(t.date);
                const daysDiff = Math.abs((txDate - receiptDate) / (1000 * 60 * 60 * 24));
                if (daysDiff <= 5) {
                    const amountDiff = Math.abs(r.amount - t.amount);
                    const pctDiff = (amountDiff / Math.max(r.amount, t.amount) * 100).toFixed(1);
                    console.log('  Potential:', t.date, t.amount, '| diff:', amountDiff.toFixed(2), '(' + pctDiff + '%) | days:', daysDiff.toFixed(0));
                }
            }
        }
    }
}

check();
