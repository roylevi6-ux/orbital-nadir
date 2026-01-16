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

async function deleteEverything() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Missing Supabase credentials');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('🗑️  DELETING ALL USER DATA...\n');

    const tables = [
        'transactions',
        'accounts', 
        'account_history',
        'salary_entries',
        'user_settings'
    ];

    for (const table of tables) {
        try {
            const { error, count } = await supabase
                .from(table)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000')
                .select('*', { count: 'exact', head: true });

            if (error) {
                console.log(`❌ Error deleting ${table}: ${error.message}`);
            } else {
                console.log(`✅ ${table} cleared`);
            }
        } catch (e) {
            console.log(`⚠️  ${table} - ${e.message}`);
        }
    }

    console.log('\n✨ All user data deleted! Ready for fresh testing.\n');
}

deleteEverything();
