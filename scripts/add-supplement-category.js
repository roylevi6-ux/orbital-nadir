
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

async function addCategory() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Missing Supabase URL or Service Role Key');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const category = {
        name_hebrew: 'תוספי תזונה',
        name_english: 'Supplements',
        type: 'expense',
        description: 'Vitamins, protein powders, supplements',
        keywords: ['ויטמינים', 'חלבון', 'תוספים', 'iherb', 'IHERB', 'מיקוליביה', 'סופר פארם']
    };

    console.log(`💊 Adding category: ${category.name_english}...`);

    const { error } = await supabase
        .from('categories')
        .insert(category);

    if (error) {
        console.error('❌ Error adding category:', error);
    } else {
        console.log('✅ Successfully added Supplements category!');
    }
}

addCategory();
