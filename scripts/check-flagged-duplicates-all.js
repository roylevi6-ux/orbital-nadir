const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    
    for (const user of users) {
        console.log(`Checking user ${user.email} (${user.id})...`);
        const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single();
        
        if (!profile) {
            console.log('  No profile');
            continue;
        }

        const { count } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', profile.household_id)
            .eq('is_duplicate', true)
            .eq('status', 'pending');
        
        console.log(`  Badged Count: ${count}`);
        
        if (count > 0) {
             const { data } = await supabase
                .from('transactions')
                .select('id, date, merchant_raw, amount, duplicate_of, status')
                .eq('household_id', profile.household_id)
                .eq('is_duplicate', true)
                .eq('status', 'pending');
             console.log('  Items:', JSON.stringify(data, null, 2));
        }
    }
}

check();
