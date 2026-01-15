const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function list() {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    console.log('Users:', users.map(u => ({ id: u.id, email: u.email })));
}
list();
