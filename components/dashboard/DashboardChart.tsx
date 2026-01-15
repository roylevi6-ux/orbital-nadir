'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartDataPoint } from '@/app/actions/get-dashboard-data';

interface Props {
    data: ChartDataPoint[];
}

export default function DashboardChart({ data }: Props) {
    if (!data || data.length === 0) {
        return <div className="h-64 flex items-center justify-center text-gray-500">No data for chart</div>;
    }

    return (
        <div className="h-80 w-full animate-in fade-in duration-700">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <defs>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                        dataKey="date"
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `₪${value}`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#0B0F19',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                            color: '#fff',
                            padding: '12px'
                        }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 500 }}
                        labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}
                        formatter={(value: any) => [`₪${value?.toLocaleString()}`, '']}
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    />
                    <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="circle"
                        formatter={(value) => <span className="text-sm text-slate-400 font-medium ml-1">{value}</span>}
                    />
                    <Bar
                        dataKey="income"
                        name="Income"
                        fill="url(#colorIncome)"
                        radius={[6, 6, 0, 0]}
                        barSize={32}
                    />
                    <Bar
                        dataKey="expense"
                        name="Expenses"
                        fill="url(#colorExpense)"
                        radius={[6, 6, 0, 0]}
                        barSize={32}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
