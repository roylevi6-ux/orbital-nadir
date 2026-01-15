
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

const check = (name) => {
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
