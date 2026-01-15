
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    console.log('Testing INSERT into accounts table...');

    // We need a valid household_id. Let's fetch the first user profile.
    const { data: profile } = await supabase.from('user_profiles').select('id, household_id').limit(1).single();

    if (!profile) {
        console.error('No profiles found to test with.');
        return;
    }

    console.log('Using profile:', profile.id, 'Household:', profile.household_id);

    const { data, error } = await supabase.from('accounts').insert({
        household_id: profile.household_id,
        name: 'Debug Account',
        type: 'savings',
        balance: 100,
        currency: 'USD',
        institution: 'Debug Bank'
    }).select().single();

    if (error) {
        console.error('INSERT FAILED:', error.message);
        console.error('Details:', error.details);
        console.error('Hint:', error.hint);
    } else {
        console.log('INSERT SUCCESS:', data);
        // Clean up
        await supabase.from('accounts').delete().eq('id', data.id);
    }
}

check();
