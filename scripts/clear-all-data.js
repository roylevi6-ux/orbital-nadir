const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

async function clearAllData() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Missing Supabase credentials');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('🗑️  Clearing all user data...\n');

    // Delete accounts
    const { error: accErr } = await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log(accErr ? '❌ Error deleting accounts' : '✅ Accounts cleared');

    // Delete account_history
    const { error: histErr } = await supabase.from('account_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log(histErr ? '❌ Error deleting account history' : '✅ Account history cleared');

    // Delete salary_entries
    const { error: salErr } = await supabase.from('salary_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log(salErr ? '❌ Error deleting salary entries' : '✅ Salary entries cleared');

    console.log('\n✅ All data cleared! Ready for testing.');
}

clearAllData();
