const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase Keys in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStats() {
    const { count: total, error: e1 } = await supabase.from('transactions').select('*', { count: 'exact', head: true });

    const { count: uncategorized, error: e2 } = await supabase.from('transactions')
        .select('*', { count: 'exact', head: true })
        .is('category', null);

    // Get samples of categorized
    const { data: samples, error: e3 } = await supabase.from('transactions')
        .select('merchant_raw, merchant_normalized, category')
        .not('category', 'is', null)
        .limit(10);

    if (e1 || e2 || e3) {
        console.error("Error fetching", e1, e2, e3);
        return;
    }

    console.log(`Total Transactions: ${total}`);
    console.log(`Uncategorized:      ${uncategorized}`);
    console.log(`Categorized:        ${total - uncategorized}`);
    console.log('\n--- Sample Categorizations ---');
    console.table(samples);
}

checkStats();
