const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: user } = await supabase.auth.admin.listUsers();
    // basic check, usually just 1 user in playground
    const userId = user.users[0].id;

    const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', userId).single();
    
    // Check count query
    const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('household_id', profile.household_id)
        .eq('is_duplicate', true)
        .eq('status', 'pending');
    
    console.log('Badge Count Logic Result:', count);

    // Fetch the actual rows
    const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('household_id', profile.household_id)
        .eq('is_duplicate', true)
        .eq('status', 'pending');
        
    console.log('Flagged Transactions:', JSON.stringify(data, null, 2));
}

check();
