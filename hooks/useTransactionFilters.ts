import { useState, useMemo } from 'react';
import { Transaction } from '@/app/actions/get-transactions';

export type SortField = 'date' | 'amount' | 'merchant' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface FilterState {
    search: string;
    category: string;
    status: string;
    dateFrom: string;
    dateTo: string;
}

export interface UseTransactionFiltersResult {
    // State
    sortField: SortField;
    sortOrder: SortOrder;
    filters: FilterState;
    showFilterPanel: boolean;

    // Actions
    setSortField: (field: SortField) => void;
    setSortOrder: (order: SortOrder) => void;
    toggleSort: (field: SortField) => void;
    setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
    clearFilters: () => void;
    setShowFilterPanel: (show: boolean) => void;

    // Computed
    filteredAndSorted: Transaction[];
    hasActiveFilters: boolean;
}

const initialFilters: FilterState = {
    search: '',
    category: '',
    status: '',
    dateFrom: '',
    dateTo: '',
};

export function useTransactionFilters(
    transactions: Transaction[]
): UseTransactionFiltersResult {
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filters, setFilters] = useState<FilterState>(initialFilters);
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters(initialFilters);
    };

    const hasActiveFilters = useMemo(() => {
        return Object.values(filters).some(v => v !== '');
    }, [filters]);

    const filteredAndSorted = useMemo(() => {
        let result = [...transactions];

        // Apply search filter
        if (filters.search) {
            const query = filters.search.toLowerCase();
            result = result.filter(tx =>
                tx.merchant_raw?.toLowerCase().includes(query) ||
                tx.merchant_normalized?.toLowerCase().includes(query) ||
                tx.category?.toLowerCase().includes(query) ||
                tx.notes?.toLowerCase().includes(query)
            );
        }

        // Apply category filter
        if (filters.category) {
            result = result.filter(tx => tx.category === filters.category);
        }

        // Apply status filter
        if (filters.status) {
            result = result.filter(tx => tx.status === filters.status);
        }

        // Apply date range filter
        if (filters.dateFrom) {
            result = result.filter(tx => tx.date >= filters.dateFrom);
        }
        if (filters.dateTo) {
            result = result.filter(tx => tx.date <= filters.dateTo);
        }

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'date':
                    comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                    break;
                case 'amount':
                    comparison = a.amount - b.amount;
                    break;
                case 'merchant':
                    comparison = (a.merchant_normalized || a.merchant_raw).localeCompare(
                        b.merchant_normalized || b.merchant_raw
                    );
                    break;
                case 'category':
                    comparison = (a.category || '').localeCompare(b.category || '');
                    break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [transactions, filters, sortField, sortOrder]);

    return {
        sortField,
        sortOrder,
        filters,
        showFilterPanel,
        setSortField,
        setSortOrder,
        toggleSort,
        setFilter,
        clearFilters,
        setShowFilterPanel,
        filteredAndSorted,
        hasActiveFilters,
    };
}
