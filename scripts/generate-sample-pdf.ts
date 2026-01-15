// Test script to generate a sample PDF report
import { generateMonthlyReportPDF, type MonthlyReportData } from '../lib/export/pdf-generator';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Sample data for testing
const sampleData: MonthlyReportData = {
    month: 1,
    year: 2026,
    monthName: 'January',
    summary: {
        totalIncome: 8500,
        totalExpenses: 6234,
        netBalance: 2266,
        currency: 'ILS',
        transactionCount: 25
    },
    categoryBreakdown: [
        { category: 'Groceries', amount: 1245, percentage: 19.97 },
        { category: 'Housing Expenses', amount: 980, percentage: 15.72 },
        { category: 'Eating Out', amount: 756, percentage: 12.13 },
        { category: 'Transportation', amount: 650, percentage: 10.43 },
        { category: 'Self Love', amount: 420, percentage: 6.74 }
    ],
    transactions: [
        {
            date: '2026-01-15',
            merchant_normalized: 'Supermarket',
            merchant_raw: 'שופרסל דיל רמת גן',
            category: 'Groceries',
            amount: 185.50,
            currency: 'ILS',
            type: 'expense'
        },
        {
            date: '2026-01-14',
            merchant_normalized: 'Salary',
            merchant_raw: 'Monthly Salary',
            category: 'Salary',
            amount: 8500,
            currency: 'ILS',
            type: 'income'
        },
        {
            date: '2026-01-13',
            merchant_normalized: 'Pizza Restaurant',
            merchant_raw: 'פיצה האט',
            category: 'Eating Out',
            amount: 120,
            currency: 'ILS',
            type: 'expense'
        },
        {
            date: '2026-01-12',
            merchant_normalized: 'Gas Station',
            merchant_raw: 'דלק',
            category: 'Transportation',
            amount: 250,
            currency: 'ILS',
            type: 'expense'
        },
        {
            date: '2026-01-11',
            merchant_normalized: 'Hair Salon',
            merchant_raw: 'מספרה',
            category: 'Self Love',
            amount: 180,
            currency: 'ILS',
            type: 'expense'
        }
    ]
};

async function generateTestPDF() {
    try {
        console.log('Generating sample PDF report...');

        const pdfBlob = await generateMonthlyReportPDF(sampleData);
        const buffer = Buffer.from(await pdfBlob.arrayBuffer());

        const outputPath = join(process.cwd(), 'sample_monthly_report_January_2026.pdf');
        writeFileSync(outputPath, buffer);

        console.log(`✅ PDF generated successfully!`);
        console.log(`📄 File saved to: ${outputPath}`);

    } catch (error) {
        console.error('❌ Error generating PDF:', error);
    }
}

generateTestPDF();
