
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

async function seedCategories() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Missing Supabase URL or Service Role Key');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const categories = [
        { name_hebrew: 'מצרכים', name_english: 'Groceries', type: 'expense', description: 'Supermarket purchases (excluding butcher/produce)', keywords: ['שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'מגה', 'סופרמרקט'] },
        { name_hebrew: 'פירות וירקות', name_english: 'Fruits & Vegetables', type: 'expense', description: 'Produce shop', keywords: ['ירקן', 'פירות', 'ירקות', 'שוק'] },
        { name_hebrew: 'בשר ודגים', name_english: 'Meat & Fish', type: 'expense', description: 'Butcher, fishmonger', keywords: ['קצב', 'דגים', 'בשר', 'בשרים'] },
        { name_hebrew: 'סופר פארם', name_english: 'Drugstore', type: 'expense', description: 'Pharmacy/drugstore', keywords: ['סופר פארם', 'SUPER-PHARM', 'SUPER PHARM', 'פארם'] },
        { name_hebrew: 'אוכל בחוץ', name_english: 'Eating Out', type: 'expense', description: 'Restaurants, deliveries (not dates)', keywords: ['מסעדת', 'פיצה', 'קפה', 'וולט', 'WOLT', 'תן ביס', 'משלוח', 'מסעדה'] },
        { name_hebrew: 'ביזבוזים', name_english: 'Splurges', type: 'expense', description: 'Nice to have non-essential spending', keywords: ['AMAZON', 'ALIEXPRESS', 'עלי אקספרס', 'אמזון'] },
        { name_hebrew: 'הוצאות דיור', name_english: 'Housing Expenses', type: 'expense', description: 'Utilities, electricity, gas, water, vaad, municipal tax, maintenance', keywords: ['חשמל', 'גז', 'מים', 'עירייה', 'ועד בית', 'ארנונה', 'חברת חשמל'] },
        { name_hebrew: 'ביטוחים ובריאות', name_english: 'Insurance & Health', type: 'expense', description: 'All insurance types: health, life, car, apartment, contents', keywords: ['ביטוח', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'קופת חולים'] },
        { name_hebrew: 'השכלה', name_english: 'Education', type: 'expense', description: 'Afterschool programs, tutors, classes', keywords: ['חוג', 'שיעור', 'קורס', 'מורה פרטי', 'לימודים'] },
        { name_hebrew: 'משכנתא', name_english: 'Mortgage', type: 'expense', description: 'Mortgage payments', keywords: ['משכנתא', 'בנק'] },
        { name_hebrew: 'טיפוח עצמי', name_english: 'Grooming', type: 'expense', description: 'Nails, haircuts, dental hygienist, facials', keywords: ['מספרה', 'ציפורניים', 'שיננית', 'ספא', 'טיפוח'] },
        { name_hebrew: 'פנאי', name_english: 'Leisure', type: 'expense', description: 'Family leisure budget including climbing & yoga (not kids classes)', keywords: ['יוגה', 'טיפוס', 'חדר כושר', 'סטודיו', 'פעילות'] },
        { name_hebrew: 'טיפולים אישיים', name_english: 'Body, Mind and Soul Healing', type: 'expense', description: 'Galia, Daniel, Efrat, Yoav, Arava', keywords: ['גליה', 'דניאל', 'אפרת', 'יואב', 'ערבה', 'טיפול'] },
        { name_hebrew: 'נותני שירות', name_english: 'Service Providers', type: 'expense', description: 'Cell provider, internet, phone line, Netflix, etc.', keywords: ['פרטנר', 'סלקום', 'הוט', 'נטפליקס', 'NETFLIX', 'SPOTIFY', 'ספוטיפיי', 'אינטרנט'] },
        { name_hebrew: 'תחבורה', name_english: 'Transportation', type: 'expense', description: 'Car maintenance, fuel, light rail, bikes', keywords: ['דלק', 'פז', 'סונול', 'דור אלון', 'רכבת', 'אוטובוס', 'תחבורה'] },
        { name_hebrew: 'נסיעות עסקיות', name_english: 'Business Travel', type: 'expense', description: 'Expenses during business trips', keywords: ['נסיעה', 'עסקי', 'עבודה'] },
        { name_hebrew: 'חוב ועלויות פיננסיות', name_english: 'Debt & Financial Costs', type: 'expense', description: 'Overdraft fees, bank charges', keywords: ['עמלה', 'ריבית', 'חובה', 'משיכת יתר', 'עמלת'] },
        { name_hebrew: 'חסכונות', name_english: 'Savings (Kids)', type: 'expense', description: 'Monthly savings for children', keywords: ['חיסכון', 'חסכון', 'ילדים'] },
        { name_hebrew: 'טיולים וחופשות', name_english: 'Trips & Vacations', type: 'expense', description: 'Family trips and holidays', keywords: ['מלון', 'BOOKING', 'AIRBNB', 'אל על', 'ישראייר', 'טיסה', 'חופשה'] },
        { name_hebrew: 'בל"מ ומתנות', name_english: 'Gifts & Unexpected', type: 'expense', description: 'Gifts and unexpected expenses', keywords: ['מתנה', 'בלתי צפוי', 'מתנות'] },
        { name_hebrew: 'הוצאה לא ידועה בכרטיס', name_english: 'Unknown (CC)', type: 'expense', description: 'CC cash withdrawals with unknown destination', keywords: ['משיכת מזומן', 'כספומט', 'ATM'] },
        { name_hebrew: 'הוצאה לא ידועה במזומן', name_english: 'Unknown (Cash)', type: 'expense', description: 'Cash expenses with unknown purpose', keywords: ['מזומן', 'לא ידוע'] },
        { name_hebrew: 'ועדים', name_english: 'Committees/Funds', type: 'expense', description: 'Account movements related to committee funds', keywords: ['ועד', 'ועדה'] },
        { name_hebrew: 'תרומות', name_english: 'Donations', type: 'expense', description: 'Charitable donations', keywords: ['תרומה', 'עמותת', 'לב"ב', 'צדקה'] },
        { name_hebrew: 'חתולים', name_english: 'Cats', type: 'expense', description: 'Food, sand and health expenses for cats', keywords: ['פטשופ', 'וטרינר', 'חיות', 'חתול', 'חתולים'] },
        // Income
        { name_hebrew: 'משכורת', name_english: 'Salary', type: 'income', description: 'Monthly salary', keywords: ['משכורת', 'שכר', 'עבודה'] },
        { name_hebrew: 'הכנסה חד פעמית/בונוס', name_english: 'One-time Income / Bonus', type: 'income', description: 'One-time income or bonus', keywords: ['בונוס', 'חד פעמי', 'פרמיה'] },
        { name_hebrew: 'משיכה מחסכונות', name_english: 'Withdrawal from Savings', type: 'income', description: 'Withdrawal from savings account', keywords: ['משיכה', 'חסכונות', 'חיסכון'] },
        { name_hebrew: 'תמיכה ממשפחה', name_english: 'Family Support', type: 'income', description: 'Financial support from family', keywords: ['תמיכה', 'משפחה', 'הורים'] },
        { name_hebrew: 'מתנה', name_english: 'Gift', type: 'income', description: 'Monetary gift', keywords: ['מתנה', 'כסף'] },
        { name_hebrew: 'קצבאות', name_english: 'Allowances / Benefits', type: 'income', description: 'Government allowances or benefits', keywords: ['ביטוח לאומי', 'קצבה', 'גמלה'] }
    ];

    console.log(`🌱 Seeding ${categories.length} categories...`);

    const { error } = await supabase
        .from('categories')
        .insert(categories);

    if (error) {
        console.error('❌ Error seeding categories:', error);
    } else {
        console.log('✅ Successfully seeded categories!');
    }
}

seedCategories();
