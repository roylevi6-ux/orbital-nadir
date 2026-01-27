'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getCategories, CategoryOption } from '@/app/actions/get-categories';

interface CategoriesContextValue {
    categories: CategoryOption[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCategories = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await getCategories();
            setCategories(res);
        } catch (e) {
            console.error('Failed to fetch categories:', e);
            setError('Failed to load categories');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    return (
        <CategoriesContext.Provider value={{ categories, loading, error, refresh: fetchCategories }}>
            {children}
        </CategoriesContext.Provider>
    );
}

export function useCategories() {
    const context = useContext(CategoriesContext);
    if (!context) {
        throw new Error('useCategories must be used within a CategoriesProvider');
    }
    return context;
}

/**
 * Hook for getting expense categories only
 */
export function useExpenseCategories() {
    const { categories, loading, error } = useCategories();
    return {
        categories: categories.filter(c => c.type === 'expense'),
        loading,
        error,
    };
}

/**
 * Hook for getting income categories only
 */
export function useIncomeCategories() {
    const { categories, loading, error } = useCategories();
    return {
        categories: categories.filter(c => c.type === 'income'),
        loading,
        error,
    };
}
