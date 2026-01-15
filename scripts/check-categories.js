
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

async function checkCategories() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Missing Supabase URL or Service Role Key');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { count, error } = await supabase
        .from('categories')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ Error checking categories:', error);
    } else {
        console.log(`✅ Categories count: ${count}`);
    }
}

checkCategories();
