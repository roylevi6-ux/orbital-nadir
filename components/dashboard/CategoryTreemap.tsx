'use client';

import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { TopCategory } from '@/app/actions/get-dashboard-data';
import { getCategoryStyles } from './CategoryIcon';

export default function CategoryTreemap({ categories }: { categories: TopCategory[] }) {
    if (!categories || categories.length === 0) {
        return <div className="h-64 flex items-center justify-center text-slate-500">No data available</div>;
    }

    // Use all categories (usually top 10 from backend)
    const data = categories.map(c => ({
        name: c.name,
        size: c.amount,
        percentage: c.percentage
    }));

    const CustomContent = (props: any) => {
        const { root, depth, x, y, width, height, index, payload, colors, rank, name, value } = props;
        const styles = getCategoryStyles(name); // Name is the category

        // Don't render tiny blocks text
        const showText = width > 50 && height > 30;

        return (
            <g>
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    className="fill-current transition-all hover:brightness-110 cursor-pointer"
                    style={{
                        fill: styles.bg.replace('bg-', 'rgb(var(--color-').replace('/10', ')'),
                        fill: getFillColor(name), // Use helper for solid colors
                        stroke: '#0f172a',
                        strokeWidth: 2,
                        rx: 4,
                        ry: 4
                    }}
                />
                {showText && (
                    <text
                        x={x + width / 2}
                        y={y + height / 2}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={12}
                        fontWeight={500}
                        dominantBaseline="middle"
                    >
                        {name}
                    </text>
                )}
                {showText && height > 50 && (
                    <text
                        x={x + width / 2}
                        y={y + height / 2 + 16}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.7)"
                        fontSize={10}
                        dominantBaseline="middle"
                    >
                        ₪{value.toLocaleString()}
                    </text>
                )}
            </g>
        );
    };

    return (
        <div className="h-80 w-full">
            <div className="flex justify-between items-center mb-6 px-1">
                <h3 className="font-bold text-white">Spending by Category</h3>
                <span className="text-xs text-muted">Where is your money going?</span>
            </div>
            <ResponsiveContainer width="100%" height="85%">
                <Treemap
                    data={data}
                    dataKey="size"
                    ratio={4 / 3}
                    stroke="#fff"
                    fill="#8884d8"
                    content={<CustomContent />}
                >
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                    <div className="bg-slate-900 border border-white/10 p-3 rounded-xl shadow-xl">
                                        <div className="font-bold text-white mb-1">{d.name}</div>
                                        <div className="text-xs text-slate-400 mb-2">{d.percentage}% of total</div>
                                        <div className="text-emerald-400 font-mono">₪{d.value?.toLocaleString()}</div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
}

function getFillColor(category: string) {
    const c = category.toLowerCase();

    // Food -> Cyan/Emerald
    if (['food', 'restaurant', 'dining', 'grocer'].some(k => c.includes(k))) return '#06b6d4'; // Cyan
    if (['transport', 'gas', 'car'].some(k => c.includes(k))) return '#f59e0b'; // Amber
    if (['shopping', 'clothing'].some(k => c.includes(k))) return '#ec4899'; // Pink
    if (['home', 'bill', 'rent'].some(k => c.includes(k))) return '#8b5cf6'; // Violet
    if (['leisure', 'fun', 'entertainment'].some(k => c.includes(k))) return '#a855f7'; // Purple
    if (['health', 'pharmacy'].some(k => c.includes(k))) return '#10b981'; // Emerald

    return '#64748b'; // Slate
}
