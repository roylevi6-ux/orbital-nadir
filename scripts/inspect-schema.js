const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users[0];
    const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single();
    
    // Just dump one transaction to see fields
    const { data } = await supabase.from('transactions').select('*').limit(1);
    console.log('Sample Transaction:', Object.keys(data[0]));
    
    // Check counts of is_duplicate variants
    const { count: dupCount } = await supabase.from('transactions').select('*', {count: 'exact', head: true}).eq('household_id', profile.household_id).eq('is_duplicate', true);
    console.log('Total is_duplicate=true:', dupCount);
}
inspect();
