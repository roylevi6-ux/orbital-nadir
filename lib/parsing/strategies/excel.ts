import * as XLSX from 'xlsx';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParseResult, ParsedTransaction } from '../types';
import { detectColumnMapping, findHeaderRow, normalizeDate } from '../heuristics';

// Polyfill for DOMMatrix if missing (needed for some XLSX operations)
if (typeof DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {
        constructor() { return this; }
        transformPoint(p: any) { return p; }
        translate() { return this; }
        scale() { return this; }
        rotate() { return this; }
        multiply() { return this; }
        inverse() { return this; }
    };
}

export async function parseExcel(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });

                // Assume first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to array of arrays first to find header
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (rawData.length === 0) {
                    resolve({
                        fileName: file.name,
                        transactions: [],
                        totalRows: 0,
                        validRows: 0,
                        errorRows: 0,
                        sourceType: 'excel'
                    });
                    return;
                }

                const headerRowIndex = findHeaderRow(rawData);
                console.log(`Detected header at row ${headerRowIndex} for ${file.name}`);

                // Get headers
                const headers = rawData[headerRowIndex].map((h: any) => String(h));
                const mapping = detectColumnMapping(headers);

                // Process rows AFTER the header
                const transactionRows = rawData.slice(headerRowIndex + 1);

                const transactions: ParsedTransaction[] = [];
                let validCount = 0;
                let errorCount = 0;

                transactionRows.forEach((rowArray, index) => {
                    // Create object based on headers for easier mapping
                    const row: Record<string, any> = {};
                    headers.forEach((h, i) => {
                        row[h] = rowArray[i];
                    });

                    const dateRaw = mapping.date ? String(row[mapping.date]) : '';
                    const parsedDate = normalizeDate(dateRaw);
                    const descRaw = mapping.description ? String(row[mapping.description]) : 'Unknown Merchant';

                    let amount = 0;
                    let isInstallment = false;
                    let installmentInfo = undefined;

                    // Logic for Amounts
                    const cleanNum = (val: any) => parseFloat(String(val || '0').replace(/[^\d.-]/g, '') || '0');

                    if (mapping.amount_billing && mapping.amount_transaction) {
                        const billingVal = cleanNum(row[mapping.amount_billing]);
                        const transactionVal = cleanNum(row[mapping.amount_transaction]);

                        // User Rule: Always take "סכום לחיוב" (billing) over "סכום עסקה" (transaction)
                        amount = billingVal;

                        // Installment Switch Rule: If Billing < Transaction => Installment
                        if (Math.abs(billingVal) > 0.01 && Math.abs(transactionVal) > Math.abs(billingVal) + 0.01) {
                            isInstallment = true;
                            const estimatedTotal = Math.round(Math.abs(transactionVal) / Math.abs(billingVal));
                            installmentInfo = {
                                total: estimatedTotal
                            };
                        }
                    } else if (mapping.credit && mapping.debit) {
                        const creditVal = cleanNum(row[mapping.credit]);
                        const debitVal = cleanNum(row[mapping.debit]);

                        if (creditVal > 0) amount = creditVal;
                        else if (debitVal > 0) amount = -debitVal;
                    } else if (mapping.amount) {
                        amount = cleanNum(row[mapping.amount]);
                    }

                    if (!parsedDate) {
                        errorCount++;
                        return;
                    }

                    // Determine Type
                    let type: 'income' | 'expense';

                    // CC Mode Detection (Billing Amount exists)
                    if (mapping.amount_billing || mapping.amount_transaction) {
                        // Credit Card Logic:
                        // Positive amount = I owe money = Expense
                        // Negative amount = I get money back = Income
                        type = amount > 0 ? 'expense' : 'income';
                    } else {
                        // Standard Bank Logic:
                        // Positive amount = Money in = Income
                        // Negative amount = Money out = Expense
                        type = amount >= 0 ? 'income' : 'expense';
                    }

                    transactions.push({
                        id: `row-${index}`,
                        date: parsedDate,
                        merchant_raw: descRaw,
                        amount: Math.abs(amount),
                        currency: 'ILS',
                        type,
                        status: 'pending',
                        is_installment: isInstallment,
                        installment_info: installmentInfo
                    });
                    validCount++;
                });

                resolve({
                    fileName: file.name,
                    transactions,
                    totalRows: rawData.length,
                    validRows: validCount,
                    errorRows: errorCount,
                    sourceType: 'excel'
                });

            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsBinaryString(file);
    });
}
