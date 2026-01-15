
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const check = (name: string) => {
    const val = process.env[name];
    if (!val) console.log(`❌ ${name} is MISSING`);
    else console.log(`✅ ${name} is present (Length: ${val.length})`);
};

console.log("--- Environment Check ---");
check('NEXT_PUBLIC_SUPABASE_URL');
check('NEXT_PUBLIC_SUPABASE_ANON_KEY');
check('SUPABASE_SERVICE_ROLE_KEY');
check('GEMINI_API_KEY');
console.log("-------------------------");
