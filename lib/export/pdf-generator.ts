import jsPDF from 'jspdf';

/**
 * Monthly report data structure
 */
export interface MonthlyReportData {
    month: number;
    year: number;
    monthName: string;
    transactions: Array<{
        date: string;
        merchant_normalized?: string | null;
        merchant_raw?: string | null;
        category?: string | null;
        amount: number;
        currency?: string;
        type: string;
    }>;
    summary: {
        totalIncome: number;
        totalExpenses: number;
        netBalance: number;
        currency: string;
        transactionCount: number;
    };
    categoryBreakdown: Array<{
        category: string;
        amount: number;
        percentage: number;
    }>;
}

/**
 * Generate PDF monthly report
 */
export async function generateMonthlyReportPDF(data: MonthlyReportData): Promise<Blob> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Helper: Add text with word wrap
    const addText = (text: string, x: number, y: number, maxWidth?: number) => {
        if (maxWidth) {
            const lines = doc.splitTextToSize(text, maxWidth);
            doc.text(lines, x, y);
            return y + (lines.length * 7);
        } else {
            doc.text(text, x, y);
            return y + 7;
        }
    };

    // ==== PAGE 1: SUMMARY ====

    // Header
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Monthly Financial Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += 12;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text(`${data.monthName} ${data.year}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Summary Box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPos, pageWidth - 30, 50, 'FD');
    yPos += 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 20, yPos);
    yPos += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    // Income
    doc.setTextColor(34, 139, 34); // Green
    doc.text(`Income:`, 20, yPos);
    doc.text(`${data.summary.totalIncome.toLocaleString()} ${data.summary.currency}`, pageWidth - 20, yPos, { align: 'right' });
    yPos += 7;

    // Expenses
    doc.setTextColor(220, 38, 38); // Red
    doc.text(`Expenses:`, 20, yPos);
    doc.text(`${data.summary.totalExpenses.toLocaleString()} ${data.summary.currency}`, pageWidth - 20, yPos, { align: 'right' });
    yPos += 7;

    // Separator line
    doc.setDrawColor(150, 150, 150);
    doc.line(20, yPos, pageWidth - 20, yPos);
    yPos += 7;

    // Net Balance
    const balanceColor: [number, number, number] = data.summary.netBalance >= 0 ? [34, 139, 34] : [220, 38, 38];
    doc.setTextColor(balanceColor[0], balanceColor[1], balanceColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`Net Balance:`, 20, yPos);
    doc.text(`${data.summary.netBalance.toLocaleString()} ${data.summary.currency}`, pageWidth - 20, yPos, { align: 'right' });
    yPos += 15;

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Category Breakdown
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Top Expense Categories', 20, yPos);
    yPos += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const topCategories = data.categoryBreakdown
        .filter(cat => cat.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    if (topCategories.length > 0) {
        topCategories.forEach((cat, index) => {
            const barWidth = (cat.percentage / 100) * (pageWidth - 80);

            // Category name and amount
            doc.text(`${index + 1}. ${cat.category}`, 20, yPos);
            doc.text(`${cat.amount.toLocaleString()} ${data.summary.currency} (${cat.percentage.toFixed(1)}%)`,
                pageWidth - 20, yPos, { align: 'right' });
            yPos += 5;

            // Progress bar
            doc.setFillColor(99, 102, 241); // Indigo
            doc.rect(20, yPos, barWidth, 3, 'F');
            doc.setDrawColor(200, 200, 200);
            doc.rect(20, yPos, pageWidth - 40, 3, 'S');
            yPos += 10;
        });
    } else {
        doc.text('No expense categories for this period', 20, yPos);
        yPos += 10;
    }

    // ==== PAGE 2+: TRANSACTION LIST ====

    if (data.transactions.length > 0) {
        doc.addPage();
        yPos = 20;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Transaction List', 20, yPos);
        yPos += 10;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        // Table Headers
        doc.setFont('helvetica', 'bold');
        doc.text('Date', 15, yPos);
        doc.text('Merchant', 40, yPos);
        doc.text('Category', 110, yPos);
        doc.text('Amount', pageWidth - 15, yPos, { align: 'right' });
        yPos += 5;

        // Header line
        doc.setDrawColor(150, 150, 150);
        doc.line(15, yPos, pageWidth - 15, yPos);
        yPos += 5;

        doc.setFont('helvetica', 'normal');

        // Sort transactions by date (newest first)
        const sortedTransactions = [...data.transactions].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        // Transaction rows
        for (const tx of sortedTransactions) {
            // Check if we need a new page
            if (yPos > pageHeight - 20) {
                doc.addPage();
                yPos = 20;

                // Repeat headers
                doc.setFont('helvetica', 'bold');
                doc.text('Date', 15, yPos);
                doc.text('Merchant', 40, yPos);
                doc.text('Category', 110, yPos);
                doc.text('Amount', pageWidth - 15, yPos, { align: 'right' });
                yPos += 5;
                doc.line(15, yPos, pageWidth - 15, yPos);
                yPos += 5;
                doc.setFont('helvetica', 'normal');
            }

            const formattedDate = new Date(tx.date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit'
            });

            const merchant = tx.merchant_normalized || tx.merchant_raw || 'Unknown';
            const merchantTruncated = merchant.length > 20 ? merchant.substring(0, 17) + '...' : merchant;

            const category = tx.category || 'Uncategorized';
            const categoryTruncated = category.length > 20 ? category.substring(0, 17) + '...' : category;

            const amountStr = `${tx.type === 'expense' ? '-' : '+'}${tx.amount.toLocaleString()} ${tx.currency || data.summary.currency}`;

            // Color code amounts
            if (tx.type === 'income') {
                doc.setTextColor(34, 139, 34); // Green
            } else {
                doc.setTextColor(0, 0, 0); // Black
            }

            doc.text(formattedDate, 15, yPos);
            doc.setTextColor(0, 0, 0);
            doc.text(merchantTruncated, 40, yPos);
            doc.text(categoryTruncated, 110, yPos);

            if (tx.type === 'income') {
                doc.setTextColor(34, 139, 34);
            }
            doc.text(amountStr, pageWidth - 15, yPos, { align: 'right' });
            doc.setTextColor(0, 0, 0);

            yPos += 6;
        }
    }

    // Footer on last page
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
        `Generated on ${new Date().toLocaleDateString('en-GB')} • ${data.summary.transactionCount} transactions`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
    );

    // Return as Blob
    return doc.output('blob');
}

/**
 * Download PDF report
 */
export function downloadPDF(blob: Blob, filename: string): void {
    // Ensure blob has correct MIME type
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });

    const link = document.createElement('a');
    const url = URL.createObjectURL(pdfBlob);

    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // Clean up after a short delay to ensure download starts
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}
