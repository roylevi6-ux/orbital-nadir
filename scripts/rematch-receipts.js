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

// Known service mappings: receipt merchant name patterns → CC transaction patterns
const KNOWN_SERVICE_MAPPINGS = [
    // Streaming & Digital Services
    { receipt: /spotify/i, transaction: /paypal.*spotify|spotify/i },
    { receipt: /netflix/i, transaction: /paypal.*netflix|netflix/i },
    { receipt: /google\s*(play|payment|one)?/i, transaction: /paypal.*google|google/i },
    { receipt: /apple/i, transaction: /apple|itunes/i },
    { receipt: /amazon/i, transaction: /paypal.*amazon|amazon|amzn/i },
    { receipt: /dropbox/i, transaction: /paypal.*dropbox|dropbox/i },
    { receipt: /adobe/i, transaction: /paypal.*adobe|adobe/i },
    { receipt: /microsoft|office\s*365/i, transaction: /paypal.*microsoft|microsoft|msft/i },
    // Cloud & Dev Services
    { receipt: /anthropic/i, transaction: /paypal.*anthropic|anthropic/i },
    { receipt: /openai/i, transaction: /paypal.*openai|openai/i },
    { receipt: /cloudflare/i, transaction: /paypal.*cloudflare|cloudflare/i },
    { receipt: /github/i, transaction: /paypal.*github|github/i },
    { receipt: /vercel/i, transaction: /paypal.*vercel|vercel/i },
    { receipt: /heroku/i, transaction: /paypal.*heroku|heroku/i },
    { receipt: /digital\s*ocean/i, transaction: /paypal.*digital|digitalocean/i },
    // Israeli Services
    { receipt: /bezeq|בזק/i, transaction: /bezeq|בזק/i },
    { receipt: /cellcom|סלקום/i, transaction: /cellcom|סלקום/i },
    { receipt: /partner|פרטנר/i, transaction: /partner|פרטנר/i },
    { receipt: /hot|הוט/i, transaction: /hot|הוט/i },
    { receipt: /yes|יס/i, transaction: /yes|יס/i },
    // Israeli Utilities
    { receipt: /electra\s*power|superpower|אלקטרה\s*פאוור/i, transaction: /electra|superpower|אלקטרה\s*פאוור/i },
    { receipt: /הארץ|haaretz/i, transaction: /הארץ|הוצאת\s*עיתון|haaretz/i },
    { receipt: /מוסדות\s*חינוך/i, transaction: /מוסדות\s*חינוך/i },
    // E-commerce
    { receipt: /aliexpress/i, transaction: /paypal.*ali|aliexpress|alibaba/i },
    { receipt: /ebay/i, transaction: /paypal.*ebay|ebay/i },
    { receipt: /temu/i, transaction: /paypal.*temu|temu/i },
    { receipt: /shein/i, transaction: /paypal.*shein|shein/i },
    // VPN & Security
    { receipt: /nord\s*(vpn|account)?/i, transaction: /paypal.*nord|nordvpn/i },
    { receipt: /express\s*vpn/i, transaction: /paypal.*express|expressvpn/i },
];

// Check if merchant names indicate the same service
function merchantsMatch(receiptMerchant, txMerchant) {
    if (!receiptMerchant || !txMerchant) return false;

    const receiptLower = receiptMerchant.toLowerCase();
    const txLower = txMerchant.toLowerCase();

    // Direct substring match
    if (receiptLower.includes(txLower) || txLower.includes(receiptLower)) {
        return true;
    }

    // Check known service mappings
    for (const mapping of KNOWN_SERVICE_MAPPINGS) {
        if (mapping.receipt.test(receiptMerchant) && mapping.transaction.test(txMerchant)) {
            return true;
        }
    }

    // Extract significant words and check overlap
    const extractWords = (s) =>
        s.toLowerCase()
         .replace(/[^\w\u0590-\u05FF]/g, ' ')
         .split(/\s+/)
         .filter(w => w.length >= 3);

    const receiptWords = new Set(extractWords(receiptMerchant));
    const txWords = extractWords(txMerchant);

    for (const word of txWords) {
        if (receiptWords.has(word)) {
            return true;
        }
    }

    return false;
}

// Amount matching with merchant-aware tolerance
// - With merchant match: 3% tolerance
// - Without merchant match: 0.5% tolerance (strict)
function amountsMatch(receiptAmount, receiptCurrency, txAmount, txCurrency, isMerchantMatch) {
    if (receiptCurrency === txCurrency) {
        const maxAmount = Math.max(receiptAmount, txAmount);
        const tolerancePercent = isMerchantMatch ? 0.03 : 0.005; // 3% vs 0.5%
        const tolerance = maxAmount * tolerancePercent;
        return Math.abs(receiptAmount - txAmount) <= tolerance;
    }
    return false;
}

async function rematchReceipts() {
    console.log('\n=== RE-MATCHING RECEIPTS (3% tolerance with merchant match) ===\n');

    // Get all unmatched receipts
    const { data: receipts, error: receiptError } = await supabase
        .from('email_receipts')
        .select('id, household_id, merchant_name, amount, currency, receipt_date')
        .is('matched_transaction_id', null)
        .eq('is_receipt', true)
        .not('amount', 'is', null);

    if (receiptError) {
        console.error('Error fetching receipts:', receiptError.message);
        return;
    }

    console.log(`Found ${receipts.length} unmatched receipts to check\n`);

    let matchCount = 0;
    const matches = [];

    for (const receipt of receipts) {
        if (!receipt.amount || !receipt.receipt_date) continue;

        // Calculate date range (±2 days)
        const receiptDate = new Date(receipt.receipt_date);
        const startDate = new Date(receiptDate);
        startDate.setDate(startDate.getDate() - 2);
        const endDate = new Date(receiptDate);
        endDate.setDate(endDate.getDate() + 2);

        // Find matching transactions
        const { data: transactions } = await supabase
            .from('transactions')
            .select('id, date, amount, currency, merchant_raw')
            .eq('household_id', receipt.household_id)
            .is('receipt_id', null)
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0]);

        if (!transactions || transactions.length === 0) continue;

        // Find best match considering merchant name
        let bestMatch = null;
        let bestScore = 0;

        for (const tx of transactions) {
            const isMerchantMatch = merchantsMatch(receipt.merchant_name, tx.merchant_raw);
            const isAmountMatch = amountsMatch(
                receipt.amount,
                receipt.currency,
                tx.amount,
                tx.currency,
                isMerchantMatch
            );

            if (isAmountMatch) {
                // Score: merchant match (100) > amount-only (50)
                const score = isMerchantMatch ? 100 : 50;
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { tx, isMerchantMatch };
                }
            }
        }

        if (bestMatch && bestMatch.isMerchantMatch) {
            // Only auto-match if merchant names correlate
            const tx = bestMatch.tx;
            const diff = Math.abs(receipt.amount - tx.amount);
            const pct = ((diff / Math.max(receipt.amount, tx.amount)) * 100).toFixed(1);

            console.log(`✓ MATCH: ${receipt.merchant_name} (${receipt.amount} ${receipt.currency}) → ${tx.merchant_raw} (${tx.amount} ${tx.currency}) [${pct}% diff]`);
            matches.push({
                receiptId: receipt.id,
                transactionId: tx.id,
                receiptMerchant: receipt.merchant_name,
                txMerchant: tx.merchant_raw
            });
            matchCount++;
        }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Found ${matchCount} new matches with merchant correlation + 3% tolerance\n`);

    if (matches.length > 0 && process.argv.includes('--apply')) {
        console.log('Applying matches...\n');

        for (const m of matches) {
            // Update transaction with receipt_id
            const { error: txError } = await supabase
                .from('transactions')
                .update({ receipt_id: m.receiptId })
                .eq('id', m.transactionId);

            if (txError) {
                console.log(`  ✗ Failed to update transaction: ${txError.message}`);
                continue;
            }

            // Update receipt with match info
            const { error: rcptError } = await supabase
                .from('email_receipts')
                .update({
                    matched_transaction_id: m.transactionId,
                    match_confidence: 90,
                    matched_at: new Date().toISOString()
                })
                .eq('id', m.receiptId);

            if (rcptError) {
                console.log(`  ✗ Failed to update receipt: ${rcptError.message}`);
                continue;
            }

            console.log(`  ✓ Linked: ${m.receiptMerchant} → ${m.txMerchant}`);
        }

        console.log('\nDone!');
    } else if (matches.length > 0) {
        console.log('Run with --apply to actually link these matches');
    }
}

rematchReceipts().catch(console.error);
