-- Seed Categories for Household Finance App
-- Run this after the initial schema migration

-- ============================================
-- EXPENSE CATEGORIES (25)
-- ============================================

INSERT INTO categories (name_hebrew, name_english, type, description, keywords) VALUES
('מצרכים', 'Groceries', 'expense', 'Supermarket purchases (excluding butcher/produce)', ARRAY['שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'מגה', 'סופרמרקט']),
('פירות וירקות', 'Fruits & Vegetables', 'expense', 'Produce shop', ARRAY['ירקן', 'פירות', 'ירקות', 'שוק']),
('בשר ודגים', 'Meat & Fish', 'expense', 'Butcher, fishmonger', ARRAY['קצב', 'דגים', 'בשר', 'בשרים']),
('סופר פארם', 'Drugstore', 'expense', 'Pharmacy/drugstore', ARRAY['סופר פארם', 'SUPER-PHARM', 'SUPER PHARM', 'פארם']),
('אוכל בחוץ', 'Eating Out', 'expense', 'Restaurants, deliveries (not dates)', ARRAY['מסעדת', 'פיצה', 'קפה', 'וולט', 'WOLT', 'תן ביס', 'משלוח', 'מסעדה']),
('ביזבוזים', 'Splurges', 'expense', 'Nice to have non-essential spending', ARRAY['AMAZON', 'ALIEXPRESS', 'עלי אקספרס', 'אמזון']),
('הוצאות דיור', 'Housing Expenses', 'expense', 'Utilities, electricity, gas, water, vaad, municipal tax, maintenance', ARRAY['חשמל', 'גז', 'מים', 'עירייה', 'ועד בית', 'ארנונה', 'חברת חשמל']),
('ביטוחים ובריאות', 'Insurance & Health', 'expense', 'All insurance types: health, life, car, apartment, contents', ARRAY['ביטוח', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'קופת חולים']),
('השכלה', 'Education', 'expense', 'Afterschool programs, tutors, classes', ARRAY['חוג', 'שיעור', 'קורס', 'מורה פרטי', 'לימודים']),
('משכנתא', 'Mortgage', 'expense', 'Mortgage payments', ARRAY['משכנתא', 'בנק']),
('טיפוח עצמי', 'Grooming', 'expense', 'Nails, haircuts, dental hygienist, facials', ARRAY['מספרה', 'ציפורניים', 'שיננית', 'ספא', 'טיפוח']),
('פנאי', 'Leisure', 'expense', 'Family leisure budget including climbing & yoga (not kids classes)', ARRAY['יוגה', 'טיפוס', 'חדר כושר', 'סטודיו', 'פעילות']),
('טיפולים אישיים', 'Body, Mind and Soul Healing', 'expense', 'Galia, Daniel, Efrat, Yoav, Arava', ARRAY['גליה', 'דניאל', 'אפרת', 'יואב', 'ערבה', 'טיפול']),
('נותני שירות', 'Service Providers', 'expense', 'Cell provider, internet, phone line, Netflix, etc.', ARRAY['פרטנר', 'סלקום', 'הוט', 'נטפליקס', 'NETFLIX', 'SPOTIFY', 'ספוטיפיי', 'אינטרנט']),
('תחבורה', 'Transportation', 'expense', 'Car maintenance, fuel, light rail, bikes', ARRAY['דלק', 'פז', 'סונול', 'דור אלון', 'רכבת', 'אוטובוס', 'תחבורה']),
('נסיעות עסקיות', 'Business Travel', 'expense', 'Expenses during business trips', ARRAY['נסיעה', 'עסקי', 'עבודה']),
('חוב ועלויות פיננסיות', 'Debt & Financial Costs', 'expense', 'Overdraft fees, bank charges', ARRAY['עמלה', 'ריבית', 'חובה', 'משיכת יתר', 'עמלת']),
('חסכונות', 'Savings (Kids)', 'expense', 'Monthly savings for children', ARRAY['חיסכון', 'חסכון', 'ילדים']),
('טיולים וחופשות', 'Trips & Vacations', 'expense', 'Family trips and holidays', ARRAY['מלון', 'BOOKING', 'AIRBNB', 'אל על', 'ישראייר', 'טיסה', 'חופשה']),
('בל"מ ומתנות', 'Gifts & Unexpected', 'expense', 'Gifts and unexpected expenses', ARRAY['מתנה', 'בלתי צפוי', 'מתנות']),
('הוצאה לא ידועה בכרטיס', 'Unknown (CC)', 'expense', 'CC cash withdrawals with unknown destination', ARRAY['משיכת מזומן', 'כספומט', 'ATM']),
('הוצאה לא ידועה במזומן', 'Unknown (Cash)', 'expense', 'Cash expenses with unknown purpose', ARRAY['מזומן', 'לא ידוע']),
('ועדים', 'Committees/Funds', 'expense', 'Account movements related to committee funds', ARRAY['ועד', 'ועדה']),
('תרומות', 'Donations', 'expense', 'Charitable donations', ARRAY['תרומה', 'עמותת', 'לב"ב', 'צדקה']),
('חתולים', 'Cats', 'expense', 'Food, sand and health expenses for cats', ARRAY['פטשופ', 'וטרינר', 'חיות', 'חתול', 'חתולים']),
('תוספי תזונה', 'Supplements', 'expense', 'Vitamins, protein powders, supplements', ARRAY['ויטמינים', 'חלבון', 'תוספים', 'iherb', 'IHERB', 'מיקוליביה']);

-- ============================================
-- INCOME CATEGORIES (6)
-- ============================================

INSERT INTO categories (name_hebrew, name_english, type, description, keywords) VALUES
('משכורת', 'Salary', 'income', 'Monthly salary', ARRAY['משכורת', 'שכר', 'עבודה']),
('הכנסה חד פעמית/בונוס', 'One-time Income / Bonus', 'income', 'One-time income or bonus', ARRAY['בונוס', 'חד פעמי', 'פרמיה']),
('משיכה מחסכונות', 'Withdrawal from Savings', 'income', 'Withdrawal from savings account', ARRAY['משיכה', 'חסכונות', 'חיסכון']),
('תמיכה ממשפחה', 'Family Support', 'income', 'Financial support from family', ARRAY['תמיכה', 'משפחה', 'הורים']),
('מתנה', 'Gift', 'income', 'Monetary gift', ARRAY['מתנה', 'כסף']),
('קצבאות', 'Allowances / Benefits', 'income', 'Government allowances or benefits', ARRAY['ביטוח לאומי', 'קצבה', 'גמלה']);
