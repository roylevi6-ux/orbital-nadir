
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

async function nukeData() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Missing Supabase URL or Service Role Key in .env.local');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('🗑️  Deleting ALL transactions...');

    // Delete all rows from transactions table
    const { error, count } = await supabase
        .from('transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Hack to delete all
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ Error deleting transactions:', error);
    } else {
        console.log(`✅ Successfully deleted all transactions.`);
    }
}

nukeData();
