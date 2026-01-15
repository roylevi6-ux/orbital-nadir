import { ShoppingCart, ShoppingBag, Utensils, Car, Home, HeartPulse, MoreHorizontal, Plane, Smartphone, Coffee, Sparkles, GraduationCap, HeartHandshake, HelpCircle, Wallet } from 'lucide-react';

export function getCategoryStyles(category: string | null, merchant?: string) {
    // 1. Explicit Uncategorized Check
    if (!category || category === 'Uncategorized' || category === 'uncategorized') {
        return { icon: HelpCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    }

    const cat = category.toLowerCase();
    const merch = merchant?.toLowerCase() || '';

    // Helper to check both category and merchant
    const matches = (keywords: string[]) => {
        return keywords.some(k => cat.includes(k) || merch.includes(k));
    };

    // 🟢 Green / Cyan Group (Essentials & Daily)
    if (matches(['food', 'restaurant', 'dining', 'eating', 'burger', 'pizza', 'sushi', 'mcdonald', 'starbucks', 'aroma']))
        return { icon: Utensils, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };

    if (matches(['grocer', 'supermarket', 'market', 'shufersal', 'mega', 'rami levy', 'carrefour', '7-eleven', 'seven eleven', 'lawson', 'family mart']))
        return { icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };

    if (matches(['transport', 'gas', 'fuel', 'station', 'paz', 'delek', 'sonol', 'dor alon', 'uber', 'taxi', 'bird', 'lime', 'dott', 'rail', 'train', 'metro']))
        return { icon: Car, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };

    // Removed "be" to avoid false positives with "benefits"
    if (matches(['health', 'pharmacy', 'doctor', 'clinic', 'super-pharm', 'maccabi', 'clalit']))
        return { icon: HeartPulse, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };

    // 🟣 Purple / Violet Group (Lifestyle, Tech, Shopping)
    if (matches(['home', 'rent', 'bill', 'electric', 'water', 'arnona', 'municipality', 'ikea', 'ace', 'home center', 'housing']))
        return { icon: Home, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' };

    // Education
    if (matches(['education', 'school', 'tuition', 'university', 'college', 'course', 'learning', 'udemy', 'coursera']))
        return { icon: GraduationCap, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' };

    // Donations / Gifts
    if (matches(['donation', 'charity', 'gift', 'present', 'non-profit']))
        return { icon: HeartHandshake, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };

    // Income / Benefits (New)
    if (matches(['salary', 'income', 'allowance', 'benefit', 'dividend', 'deposit']))
        return { icon: Wallet, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };

    if (matches(['tech', 'mobile', 'internet', 'phone', 'apple', 'google', 'microsoft', 'ksp', 'ivory', 'bug', 'partner', 'cellcom', 'pelephone']))
        return { icon: Smartphone, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' };

    if (matches(['travel', 'hotel', 'airbnb', 'booking', 'flight', 'airline', 'el al', 'israir', 'arkia']))
        return { icon: Plane, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' };

    if (matches(['coffee', 'cafe', 'espresso', 'nespresso']))
        return { icon: Coffee, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' };

    // Added "leisure"
    if (matches(['splurge', 'fun', 'entertainment', 'cinema', 'movie', 'netflix', 'spotify', 'disney', 'steam', 'playstation', 'xbox', 'nintendo', 'leisure']))
        return { icon: Sparkles, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' };

    // General Shopping Fallback
    if (matches(['zara', 'h&m', 'castro', 'fox', 'nike', 'adidas', 'uniqlo', 'gu', 'don quijote', 'donki', 'hands', 'loft', 'bic camera', 'yodobashi', 'shopping']))
        return { icon: ShoppingBag, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' };

    // Fallback for Uncategorized (redundant check but safe)
    if (matches(['uncategorized', 'general', 'unknown', 'other']))
        return { icon: HelpCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };

    return { icon: MoreHorizontal, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
}
