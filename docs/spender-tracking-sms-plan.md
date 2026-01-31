# Spender Tracking + Real-time SMS Transactions - Implementation Plan

## Overview

Two interconnected features for the Orbital Nadir household finance app:

1. **Spender Tracking** - Tag every transaction with the household member who made it (R or N) based on credit card identification
2. **Real-time SMS Ingestion** - Process forwarded credit card SMS notifications for near-instant transaction visibility, with smart deduplication against monthly CC slip uploads

---

# FEATURE 1: Spender Tracking

## Problem

In a household with two members (R and N), each with their own credit cards, there's no way to see:
- Who spent what
- Individual spending patterns
- Per-person budget tracking

## Solution

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Spender names | **Customizable** | Users set their own names in Settings |
| Historical data | **Fresh start** | Existing data will be erased, only new uploads matter |
| Unknown spender | **Require selection** | Block upload until user selects spender |

### Card-to-Spender Mapping

| Spender | Card Endings | Description |
|---------|--------------|-------------|
| **R** (default name) | 8770 | Primary cardholder (1 card) |
| **N** (default name) | 8937, 6892, 5592 | Secondary cardholder (3 cards) |

*Names are customizable in Settings*

### Detection Strategy

**Priority 1: Auto-detect from source data**
- CC slip CSV often has card last-4 in header row or filename
- SMS contains card ending in message body
- Bank statement may reference card
- Look for patterns: `*8770`, `כרטיס 8770`, `card ending 8770`

**Priority 2: REQUIRED user selection during upload**
- If card cannot be detected, **block upload** until user selects
- "Who made these transactions?" - must answer before proceeding
- Selection applies to ALL transactions in that upload batch
- UI: Clear R / N buttons (with custom names from settings)

### Database Changes

```sql
-- Spender configuration per household
CREATE TABLE IF NOT EXISTS household_spenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) NOT NULL,
    spender_key TEXT NOT NULL,  -- 'R' or 'N' (internal key)
    display_name TEXT NOT NULL,  -- Customizable: "Roy", "Noa", etc.
    color TEXT DEFAULT '#3B82F6',  -- Hex color for UI
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, spender_key)
);

-- Seed default spenders for existing households
INSERT INTO household_spenders (household_id, spender_key, display_name, color)
SELECT id, 'R', 'R', '#3B82F6' FROM households
UNION ALL
SELECT id, 'N', 'N', '#EC4899' FROM households;

-- Add spender column to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS spender TEXT CHECK (spender IN ('R', 'N'));

-- Card-to-spender mapping table
CREATE TABLE IF NOT EXISTS household_card_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) NOT NULL,
    card_ending TEXT NOT NULL,  -- Last 4 digits
    spender TEXT NOT NULL CHECK (spender IN ('R', 'N')),
    card_nickname TEXT,  -- e.g., "Roy's Isracard", "Noa's Max"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, card_ending)
);

-- Index for fast lookups
CREATE INDEX idx_transactions_spender ON transactions(household_id, spender);
CREATE INDEX idx_card_mappings_lookup ON household_card_mappings(household_id, card_ending);
```

---

# FEATURE 2: Real-time SMS Transactions + Deduplication

## Data Source Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ORBITAL NADIR - DATA FLOW ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                          REAL-TIME INPUTS
    ┌──────────────────────────────────────────┼──────────────────────────────────────────┐
    │                                          │                                          │
    ▼                                          ▼                                          ▼
┌─────────────┐                        ┌─────────────┐                            ┌─────────────┐
│  📱 SMS     │                        │  📧 EMAIL   │                            │  📧 EMAIL   │
│  (Isracard  │                        │  RECEIPT    │                            │  (Store     │
│   Cal/Max)  │                        │  (TRX SMS)  │                            │   Receipt)  │
└──────┬──────┘                        └──────┬──────┘                            └──────┬──────┘
       │                                      │                                          │
       │ iOS Shortcut                         │ iOS Shortcut                             │ Auto-forward
       │ "אושרה עסקה"                         │ Subject: "TRX SMS Received"              │ from merchant
       │                                      │                                          │
       ▼                                      ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    📬 EMAIL ENDPOINT                                                 │
│                                    /api/email/receive                                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Matching Rules

| Match Type | Rules |
|------------|-------|
| **SMS → CC** | Amount EXACT, Date ±1 day, Card MUST match if both have it |
| **Email → TX** | Amount ±5%, Date varies by merchant type: Retail ±2 days, Utility/Insurance/Telecom ±30 days |
| **BIT → TX** | Existing flow (PRESERVE) |
| **BIT no match** | Flag for user review → User confirms → Create as standalone transaction |
| **BIT withdrawal** | Match to bank statement → Mark as reimbursement → User categorizes manually |

## Email Matching by Merchant Type

| Email Type | Typical Delay | Matching Window |
|------------|---------------|-----------------|
| **Store receipts** | Minutes to hours | ±2 days |
| **Utility bills** | 2-4 weeks after service period ends | ±30 days |
| **Subscription confirmations** | Same day as charge | ±2 days |
| **Insurance payments** | 1-3 weeks after charge | ±21 days |

```typescript
function detectMerchantType(merchantName: string): MerchantType {
    const name = merchantName.toLowerCase();

    // Utility companies - 30 day window
    if (/חברת החשמל|עירית|ארנונה|מקורות|מים|גז/.test(name)) return 'utility';

    // Insurance - 30 day window
    if (/מנורה|הראל|כלל|הפניקס|מגדל|ביטוח/.test(name)) return 'insurance';

    // Telecom - 30 day window
    if (/בזק|פרטנר|סלקום|hot|גולן|רמי לוי תקשורת/.test(name)) return 'telecom';

    // Subscriptions - 2 day window
    if (/netflix|spotify|apple|google|microsoft|amazon prime/.test(name)) return 'subscription';

    return 'retail';  // Default 2 day window
}
```

## BIT/Paybox Edge Cases

### Edge Case 1: BIT Payment with No Matching CC Transaction

- User pays with stored BIT/Paybox balance (not linked to credit card)
- System flags for user review
- User can confirm → creates standalone transaction with `source='bit_standalone'`

### Edge Case 2: BIT/Paybox Withdrawal to Bank Account

- User transfers BIT/Paybox balance to their bank account
- Match to bank statement income entry
- Mark as **reimbursement** (`is_reimbursement: true`)
- User manually categorizes (included in analytics)

## Deduplication Rules Summary

| When | Source | Action | Status After |
|------|--------|--------|--------------|
| SMS arrives | SMS | Create transaction | `provisional` |
| Email arrives | Email | Find & enrich existing tx | unchanged |
| CC Slip uploaded | CC Slip | Match to SMS tx, confirm | `provisional` → `pending` |
| CC Slip uploaded | CC Slip | No SMS match, create new | `pending` |
| 30 days, no CC match | System | Flag unmatched SMS tx | `provisional` → `flagged` |
| BIT no match | BIT Screenshot | Flag for user review | `flagged` |
| BIT confirmed standalone | User action | Create new transaction | `pending` |
| BIT/Paybox withdrawal | BIT Screenshot | Mark as reimbursement | `pending` (user categorizes) |

## SMS Database Schema

```sql
CREATE TABLE sms_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) NOT NULL,
    card_ending TEXT NOT NULL,
    merchant_name TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'ILS',
    transaction_date DATE NOT NULL,
    spender TEXT CHECK (spender IN ('R', 'N')),
    provider TEXT CHECK (provider IN ('isracard', 'cal', 'max', 'leumi', 'unknown')),
    raw_message TEXT NOT NULL,
    transaction_id UUID REFERENCES transactions(id),
    cc_matched BOOLEAN DEFAULT FALSE,
    cc_matched_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sms_pending ON sms_transactions(household_id, cc_matched)
    WHERE cc_matched = FALSE;
CREATE INDEX idx_sms_matching ON sms_transactions(household_id, transaction_date, amount);
```

## Supported Credit Card Providers

| Provider | SMS Sender | Trigger Phrase |
|----------|-----------|----------------|
| **Isracard** | Isracard | אושרה עסקה |
| **Visa Cal** | CAL, ויזה כאל | בוצעה עסקה / אושרה עסקה |
| **Max** | max, מקס | עסקה אושרה / חיוב בכרטיס |
| **Leumi Card** | לאומי קארד | בוצע חיוב / אושרה עסקה |

---

# Implementation Summary

## New Database Tables

| Table | Purpose |
|-------|---------|
| `household_spenders` | Spender configuration per household |
| `household_card_mappings` | Map card endings to spenders (R/N) |
| `sms_transactions` | Store incoming SMS with dedup tracking |

## New Files

| File | Purpose |
|------|---------|
| `/app/actions/parse-sms-receipt.ts` | SMS parsing with multi-provider regex |
| `/app/actions/sms-deduplication.ts` | Dedup logic for SMS vs CC slip |
| `/app/actions/spender-detection.ts` | Auto-detect spender from card ending |
| `/supabase/migrations/20260131000000_spender_and_sms.sql` | All schema changes |
| `/components/upload/SpenderSelector.tsx` | Upload page spender selection UI |
| `/components/analytics/SpenderBreakdown.tsx` | Analytics spender visualization |

## Modified Files

| File | Changes |
|------|---------|
| `/app/api/email/receive/route.ts` | Detect SMS, route to SMS parser |
| `/app/upload/page.tsx` | Add spender selection UI |
| `/app/transactions/page.tsx` | Add "Who" column, spender filter |
| `/app/dashboard/page.tsx` | Update charts for spender breakdown |
| `/app/actions/save-transactions.ts` | Handle spender field |
| `/app/actions/match-receipts.ts` | Add SMS matching function |

---

## Verification Steps

### Feature 1: Spender Tracking
1. Upload CC slip with card 8770 → transactions tagged as R
2. Upload CC slip with card 8937 → transactions tagged as N
3. Upload unknown card → prompted for spender selection
4. Transaction page shows "Who" column correctly
5. Analytics charts show spender breakdown

### Feature 2: SMS + Deduplication
1. Forward Isracard SMS → stored in sms_transactions
2. SMS creates provisional transaction (visible in UI)
3. Upload CC slip with matching transaction → merges correctly
4. SMS marked as "matched"
5. Unmatched provisional after 30 days → flagged

### Feature 2b: Email Enrichment Matching
1. Email receipt from retail → matches within ±2 days
2. Email from utility (חברת החשמל) → matches within ±30 days
3. Email from insurance (מנורה) → matches within ±30 days

### Feature 2c: BIT/Paybox Edge Cases
1. BIT payment with no CC transaction → flagged for user review
2. User confirms BIT as standalone → creates new transaction
3. BIT withdrawal to bank account → marked as reimbursement
4. User manually categorizes BIT withdrawal (included in analytics)

---

## Git Branch

`feature/spender-tracking-realtime-sms`
