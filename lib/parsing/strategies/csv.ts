import Papa from 'papaparse';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParsingStrategy, ParsedTransaction, ParseResult } from '../types';
import { detectColumnMapping, findHeaderRow, normalizeDate, detectCurrencyFromData } from '../heuristics';
import { logger } from '@/lib/logger';

export async function parseCSV(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: false, // We'll detect header row ourselves
            skipEmptyLines: true,
            complete: (results) => {
                const rawData = results.data as any[][]; // Array of arrays

                if (rawData.length === 0) {
                    resolve({
                        fileName: file.name,
                        transactions: [],
                        totalRows: 0,
                        validRows: 0,
                        errorRows: 0,
                        sourceType: 'csv'
                    });
                    return;
                }

                // Detect header row
                const headerRowIndex = findHeaderRow(rawData);
                logger.debug(`Detected header at row ${headerRowIndex} for ${file.name}`);

                // Get headers
                const headers = rawData[headerRowIndex].map(h => String(h));
                const mapping = detectColumnMapping(headers);

                // Process rows AFTER the header
                const transactionRows = rawData.slice(headerRowIndex + 1);

                // Detect currency from headers and first few data rows
                const detectedCurrency = detectCurrencyFromData(headers, transactionRows);
                logger.debug(`Detected currency: ${detectedCurrency} for ${file.name}`);

                const transactions: ParsedTransaction[] = [];
                let validCount = 0;
                let errorCount = 0;

                transactionRows.forEach((rowArray, index) => {
                    // Create map
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

                    const cleanNum = (val: any) => parseFloat(String(val || '0').replace(/[^\d.-]/g, '') || '0');

                    if (mapping.amount_billing && mapping.amount_transaction) {
                        const billingVal = cleanNum(row[mapping.amount_billing]);
                        const transactionVal = cleanNum(row[mapping.amount_transaction]);

                        amount = billingVal;

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

                    if (mapping.amount_billing || mapping.amount_transaction) {
                        type = amount > 0 ? 'expense' : 'income';
                    } else {
                        type = amount >= 0 ? 'income' : 'expense';
                    }

                    transactions.push({
                        id: `row-${index}`,
                        date: parsedDate,
                        merchant_raw: descRaw,
                        amount: Math.abs(amount),
                        currency: detectedCurrency,
                        type: type,
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
                    sourceType: 'csv'
                });
            },
            error: (error) => {
                reject(error);
            }
        });
    });
}
