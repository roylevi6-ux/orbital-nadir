const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStats() {
    console.log('\n=== EMAIL RECEIPT STATS ===\n');

    // Total email receipts
    const { count: totalReceipts } = await supabase
        .from('email_receipts')
        .select('*', { count: 'exact', head: true });
    console.log(`Total email_receipts: ${totalReceipts}`);

    // Matched receipts
    const { count: matchedReceipts } = await supabase
        .from('email_receipts')
        .select('*', { count: 'exact', head: true })
        .not('matched_transaction_id', 'is', null);
    console.log(`Matched receipts: ${matchedReceipts}`);

    // Unmatched receipts that are actual receipts
    const { count: unmatchedReceipts } = await supabase
        .from('email_receipts')
        .select('*', { count: 'exact', head: true })
        .is('matched_transaction_id', null)
        .eq('is_receipt', true);
    console.log(`Unmatched receipts (is_receipt=true): ${unmatchedReceipts}`);

    // Non-receipts
    const { count: nonReceipts } = await supabase
        .from('email_receipts')
        .select('*', { count: 'exact', head: true })
        .eq('is_receipt', false);
    console.log(`Non-receipts (is_receipt=false): ${nonReceipts}`);

    // Transactions with receipt_id
    const { count: txWithReceipt } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .not('receipt_id', 'is', null);
    console.log(`Transactions with receipt_id: ${txWithReceipt}`);

    console.log('\n=== UNMATCHED RECEIPT DETAILS ===\n');

    // Get sample of unmatched receipts
    const { data: unmatchedSample } = await supabase
        .from('email_receipts')
        .select('merchant_name, amount, currency, receipt_date')
        .is('matched_transaction_id', null)
        .eq('is_receipt', true)
        .order('receipt_date', { ascending: false })
        .limit(15);

    if (unmatchedSample && unmatchedSample.length > 0) {
        console.log('Recent unmatched receipts:');
        unmatchedSample.forEach(r => {
            console.log(`  ${r.receipt_date} | ${r.merchant_name} | ${r.amount} ${r.currency}`);
        });
    }

    console.log('\n=== POTENTIAL MATCHES CHECK ===\n');

    // Check if unmatched receipts have potential transaction matches
    if (unmatchedSample && unmatchedSample.length > 0) {
        for (const receipt of unmatchedSample.slice(0, 5)) {
            if (!receipt.amount || !receipt.receipt_date) continue;

            // Look for transactions with similar amount/date
            const receiptDate = new Date(receipt.receipt_date);
            const startDate = new Date(receiptDate);
            startDate.setDate(startDate.getDate() - 3);
            const endDate = new Date(receiptDate);
            endDate.setDate(endDate.getDate() + 3);

            const { data: potentialMatches } = await supabase
                .from('transactions')
                .select('id, date, amount, currency, merchant_raw, receipt_id')
                .gte('date', startDate.toISOString().split('T')[0])
                .lte('date', endDate.toISOString().split('T')[0])
                .gte('amount', receipt.amount - 1)
                .lte('amount', receipt.amount + 1)
                .limit(3);

            console.log(`\nReceipt: ${receipt.merchant_name} | ${receipt.amount} ${receipt.currency} | ${receipt.receipt_date}`);
            if (potentialMatches && potentialMatches.length > 0) {
                console.log('  Potential matches:');
                potentialMatches.forEach(tx => {
                    const hasReceipt = tx.receipt_id ? '(already matched)' : '(unmatched)';
                    console.log(`    - ${tx.date} | ${tx.merchant_raw} | ${tx.amount} ${tx.currency} ${hasReceipt}`);
                });
            } else {
                console.log('  No potential transaction matches found');
            }
        }
    }

    console.log('\n');
}

checkStats().catch(console.error);
