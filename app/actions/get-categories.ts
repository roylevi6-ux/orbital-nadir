'use server';

import { createClient } from '@/lib/auth/server';

export interface CategoryOption {
    id: string;
    name_english: string;
    name_hebrew: string;
    type: 'expense' | 'income';
}

export async function getCategories(): Promise<CategoryOption[]> {
    const supabase = await createClient();

    // We don't necessarily need a user session to fetch generic categories if they are public,
    // but typically they are system-wide.
    // If we have custom categories per household, we need auth.
    // Let's assume auth is required.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('categories')
        .select('id, name_english, name_hebrew, type')
        .order('name_english');

    if (error) {
        console.error('Failed to fetch categories:', error);
        return [];
    }

    return data || [];
}
