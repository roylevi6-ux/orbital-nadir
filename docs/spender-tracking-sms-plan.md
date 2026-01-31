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

### Upload Page Changes

1. **Auto-detection attempt** on file parse
   - Check CSV header for card patterns: `*8770`, `כרטיס 8770`, etc.
   - Check filename for card numbers
   - If card found in `household_card_mappings` → auto-assign spender

2. **REQUIRED selection if detection fails** (blocks upload):
   ```
   ┌─────────────────────────────────────────────────┐
   │ 📄 File: isracard-jan-2025.csv                  │
   │ 📊 Found: 47 transactions                       │
   │                                                 │
   │ ⚠️  Could not detect card holder                │
   │                                                 │
   │ Who made these transactions?                    │
   │                                                 │
   │   ┌─────────────┐    ┌─────────────┐           │
   │   │    👤 R     │    │    👤 N     │           │
   │   │   (Roy)     │    │   (Noa)     │           │
   │   └─────────────┘    └─────────────┘           │
   │                                                 │
   │ ─────────────────────────────────────────────  │
   │ 💡 Save this card for future:                  │
   │    Card ending: [8770] → Always assign to [R▼] │
   │    [ ] Remember this mapping                   │
   │                                                 │
   │          [Cancel]        [Continue →]          │
   └─────────────────────────────────────────────────┘
   ```

   - **Continue button disabled** until spender selected
   - Optional: Save card mapping for future auto-detection

3. **Auto-detected flow** (no blocking):
   ```
   ┌─────────────────────────────────────────────────┐
   │ 📄 File: isracard-jan-2025.csv                  │
   │ 📊 Found: 47 transactions                       │
   │                                                 │
   │ ✅ Detected: Card *8770 → R (Roy)               │
   │                                                 │
   │ [Change]              [Continue →]             │
   └─────────────────────────────────────────────────┘
   ```

### Transaction Page Changes

Add "Who" column (better than "Spender"):

| Date | Who | Merchant | Amount | Category | Status |
|------|-----|----------|--------|----------|--------|
| 29/01 | R | מנורה מבטחים | ₪143.42 | ביטוח | ✓ |
| 29/01 | N | סופר פארם | ₪89.90 | מכולת | ✓ |

**UI considerations:**
- Color-coded badges: R = blue, N = pink (or user-configurable)
- Filter by spender
- Bulk assign spender to selected transactions

### Settings Page

- View current card → spender mappings
- Add/edit/remove card associations
- Customize spender names and colors

---

# FEATURE 2: Real-time SMS Transactions + Deduplication

## Data Source Architecture

### Full System Architecture Diagram

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
│                                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              DETECTION & ROUTING                                             │   │
│   │                                                                                              │   │
│   │   Subject == "TRX SMS Received"  ─────► SMS Parser ─────► sms_transactions table            │   │
│   │            OR                                │                     │                         │   │
│   │   Content has "אושרה עסקה"                   │                     │                         │   │
│   │                                              │                     ▼                         │   │
│   │                                              │         ┌─────────────────────┐               │   │
│   │                                              │         │ CREATE TRANSACTION  │               │   │
│   │                                              │         │ status: provisional │               │   │
│   │                                              │         │ spender: R/N        │               │   │
│   │                                              │         └──────────┬──────────┘               │   │
│   │                                              │                    │                          │   │
│   │   Otherwise ──────────────────────► Email Receipt Parser          │                          │   │
│   │                                              │                    │                          │   │
│   │                                              ▼                    │                          │   │
│   │                                    ┌─────────────────┐            │                          │   │
│   │                                    │ MATCH to        │            │                          │   │
│   │                                    │ existing tx?    │◄───────────┘                          │   │
│   │                                    │ (amount ±5%,    │                                       │   │
│   │                                    │  date ±2 days)  │                                       │   │
│   │                                    └────────┬────────┘                                       │   │
│   │                                             │                                                │   │
│   │                              ┌──────────────┴──────────────┐                                 │   │
│   │                              │                             │                                 │   │
│   │                         Match Found                   No Match                               │   │
│   │                              │                             │                                 │   │
│   │                              ▼                             ▼                                 │   │
│   │                    ┌─────────────────┐           ┌─────────────────┐                        │   │
│   │                    │ ENRICH tx       │           │ Store orphaned  │                        │   │
│   │                    │ - Attach receipt│           │ (retry later    │                        │   │
│   │                    │ - Add items     │           │  when CC comes) │                        │   │
│   │                    │ - Store PDF     │           └─────────────────┘                        │   │
│   │                    └─────────────────┘                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘


                                         MONTHLY UPLOADS
    ┌──────────────────────────────────────────┼──────────────────────────────────────────┐
    │                                          │                                          │
    ▼                                          ▼                                          ▼
┌─────────────┐                        ┌─────────────┐                            ┌─────────────┐
│  📄 CC SLIP │                        │  🏦 BANK    │                            │  📸 BIT/    │
│  CSV        │                        │  STATEMENT  │                            │  PAYBOX     │
│  (Monthly)  │                        │  PDF        │                            │  Screenshots│
└──────┬──────┘                        └──────┬──────┘                            └──────┬──────┘
       │                                      │                                          │
       │                                      │                                          │
       ▼                                      ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    📤 UPLOAD PAGE                                                    │
│                                    /upload                                                           │
│                                                                                                      │
│   ┌────────────────────────────────┐  ┌────────────────────────────────┐  ┌────────────────────────┐│
│   │      CC SLIP PROCESSING        │  │    BANK STATEMENT PROCESSING   │  │   BIT/PAYBOX FLOW      ││
│   │                                │  │                                │  │   ⚠️ PRESERVE AS-IS    ││
│   │  1. Parse CSV                  │  │  1. Parse PDF (column-based)   │  │                        ││
│   │  2. Detect card ending         │  │  2. Extract transactions       │  │  Existing OCR &        ││
│   │  3. Lookup spender (R/N)       │  │  3. No SMS dedup (bank only)   │  │  reconciliation flow   ││
│   │  4. For each transaction:      │  │  4. Create transactions        │  │  handles P2P matching  ││
│   │                                │  │     status: pending            │  │                        ││
│   │     ┌─────────────────────┐    │  │                                │  │  Links to existing     ││
│   │     │ Find matching SMS?  │    │  │  (Separate from SMS flow -     │  │  transactions for      ││
│   │     │ (amount exact,      │    │  │   bank doesn't get SMS)        │  │  enrichment only       ││
│   │     │  date ±1 day,       │    │  │                                │  │                        ││
│   │     │  card must match)   │    │  └────────────────────────────────┘  └────────────────────────┘│
│   │     └──────────┬──────────┘    │                                                                │
│   │                │               │                                                                │
│   │     ┌──────────┴──────────┐    │                                                                │
│   │     │                     │    │                                                                │
│   │  SMS Match            No Match │                                                                │
│   │     │                     │    │                                                                │
│   │     ▼                     ▼    │                                                                │
│   │ ┌──────────────┐  ┌──────────┐ │                                                                │
│   │ │ MERGE/DEDUP  │  │ CREATE   │ │                                                                │
│   │ │              │  │ NEW TX   │ │                                                                │
│   │ │ - Update tx  │  │          │ │                                                                │
│   │ │   provisional│  │ status:  │ │                                                                │
│   │ │   → pending  │  │ pending  │ │                                                                │
│   │ │ - Keep SMS   │  │          │ │                                                                │
│   │ │   merchant   │  │ (SMS was │ │                                                                │
│   │ │ - Mark SMS   │  │  missing)│ │                                                                │
│   │ │   matched    │  │          │ │                                                                │
│   │ └──────────────┘  └──────────┘ │                                                                │
│   └────────────────────────────────┘                                                                │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Source Timeline & Priority

```
Timeline:  ─────────────────────────────────────────────────────────────────────►
           Purchase      SMS          Email         CC Slip        BIT/Paybox
           happens       (seconds)    (minutes)     (weeks later)  (monthly)
              │            │            │               │              │
              ▼            ▼            ▼               ▼              ▼
           ┌──────┐    ┌──────┐    ┌──────┐       ┌──────────┐    ┌────────┐
           │ 💳   │───►│ 📱   │───►│ 📧   │──...──►│ 📄 CSV   │───►│ 🔄 P2P │
           │ Swipe│    │ SMS  │    │Email │       │ CC Slip  │    │Reconcile│
           └──────┘    └──────┘    └──────┘       └──────────┘    └────────┘
                         ▲            ▲               ▲              ▲
                         │            │               │              │
                    Source of      Enrichment     Final Dedup    Separate Flow
                    Truth (live)   (attach to tx) (merge SMS→CC)  (PRESERVE AS-IS)
```

| Source | Role | Frequency | Timing | Dedup Behavior |
|--------|------|-----------|--------|----------------|
| **SMS** | Transaction (Source of Truth until CC arrives) | Real-time | Seconds after purchase | Creates transaction immediately |
| **Email Receipts** | Enrichment only | Real-time | Minutes after purchase | Attaches to existing transaction |
| **CC Slip CSV** | Transaction (Final Source of Truth) | Monthly | Weeks after SMS | Merges with SMS, auto-dedupes |
| **Bank Statement** | Transaction | Monthly | Same as CC slip | Separate flow (no SMS) |
| **BIT/Paybox Screenshots** | P2P Reconciliation | Monthly | Same as CC slip | **PRESERVE EXISTING FLOW** |

### Key Principles

1. **SMS = Source of Truth (Live)**: SMS creates the transaction immediately. User sees it in dashboard within seconds.
2. **Email = Enrichment Only**: Email receipts attach to existing transactions (from SMS or CC). Never creates new transactions.
3. **CC Slip = Final Authority**: When CC slip arrives, it confirms/updates SMS transactions. Any SMS without CC match after 30 days → flagged.
4. **BIT/Paybox = Separate**: Existing reconciliation flow is preserved. Do NOT touch.

---

## Matching Rules

| Match Type | Rules |
|------------|-------|
| **SMS → CC** | Amount EXACT, Date ±1 day, Card MUST match if both have it |
| **Email → TX** | Amount ±5%, Date varies by merchant type: Retail ±2 days, Utility/Insurance/Telecom ±30 days |
| **BIT → TX** | Existing flow (PRESERVE) |
| **BIT no match** | Flag for user review → User confirms → Create as standalone transaction |
| **BIT withdrawal** | Match to bank statement → Mark as reimbursement → User categorizes manually |

## Email Matching by Merchant Type

**Important**: Email matching is for enrichment, not deduplication. Email receipts can arrive at very different times depending on the merchant type:

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

---

## BIT/Paybox Edge Cases

### Edge Case 1: BIT Payment with No Matching CC Transaction

**Scenario**: User pays with stored BIT/Paybox balance (not linked to credit card)

```
Day 1           │ 📱 User pays ₪150 to friend via BIT
                │    → BIT deducts from stored balance
                │    → NO credit card SMS (paid from BIT wallet)
                │    → NO CC slip entry
                │
Week 4          │ 📸 BIT screenshot shows: "העברה ל-חבר ₪150"
                │    → System tries to match to existing transaction
                │    → NO MATCH FOUND (no CC transaction exists)
                │
                │    → FLAG FOR USER REVIEW ⚠️
                │    → Show: "BIT payment with no matching CC transaction"
                │    → Options:
                │       [Create as Transaction] - User confirms this is a real expense
                │       [Skip] - False positive / test transfer
                │
                │    IF user confirms → CREATE transaction:
                │       - type: expense
                │       - source: 'bit_standalone'
                │       - status: pending
                │       - merchant: from BIT recipient name
                │       - spender: from account owner (need mapping)
```

**Implementation**:
```typescript
// In BIT reconciliation flow
if (!matchingCcTransaction) {
    // Flag for manual review - DO NOT auto-create
    await flagBitForReview({
        bitTransaction,
        reason: 'no_cc_match',
        suggested_action: 'create_standalone_transaction',
        review_prompt: 'This BIT payment has no matching credit card transaction. Did you pay from stored BIT balance?'
    });
}

// When user confirms
async function confirmBitAsStandaloneTransaction(bitId: string): Promise<Transaction> {
    const bit = await getBitTransaction(bitId);

    const transaction = await createTransaction({
        amount: bit.amount,
        date: bit.transaction_date,
        merchant_raw: bit.recipient_name,
        type: 'expense',
        source: 'bit_standalone',
        status: 'pending',
        bit_link: bitId,
        // Spender derived from BIT account owner mapping
    });

    await markBitAsReconciled(bitId, transaction.id);
    return transaction;
}
```

### Edge Case 2: BIT/Paybox Withdrawal to Bank Account

**Scenario**: User transfers BIT/Paybox balance to their bank account

```
Day 1           │ 📱 User withdraws ₪5,000 from BIT to bank
                │    → BIT shows: "משיכה לחשבון ₪5,000"
                │
Week 2          │ 🏦 Bank statement shows: "העברה BIT ₪5,000"
                │    → This is INCOME in bank statement context
                │
Week 4          │ 📸 BIT screenshot shows withdrawal
                │    → System sees ₪5,000 "משיכה"
                │
                │    → MATCH TO BANK STATEMENT (not CC)
                │    → Mark as REIMBURSEMENT (type: income, is_reimbursement: true)
                │    → Link both records together
                │    → FLAG FOR USER TO MANUALLY CATEGORIZE
                │    → INCLUDED in analytics (user decides category)
```

**Why Reimbursement, Not Internal Transfer**:
- BIT balance came from money already spent/transferred
- Withdrawing it back is like getting reimbursed
- User should categorize it (e.g., "refund", "P2P settlement", etc.)
- Should appear in analytics so user has full visibility

**Detection Rules**:
```typescript
function isBitWithdrawal(bitTransaction: BitTransaction): boolean {
    const withdrawalPatterns = [
        /משיכה\s*(לחשבון|לבנק)/,
        /העברה\s*לחשבון/,
        /withdrawal/i
    ];
    return withdrawalPatterns.some(p => p.test(bitTransaction.description));
}
```

---

## Deduplication Rules Summary

| When | Source | Action | Status After | Auto-Cat Trigger |
|------|--------|--------|--------------|------------------|
| SMS arrives | SMS | Create transaction | `provisional` | **YES** - immediate |
| Email arrives | Email | Find & enrich existing tx | unchanged | **YES** - if new info helps |
| CC Slip uploaded | CC Slip | Match to SMS tx, confirm | `provisional` → `pending` | **NO** - preserve SMS category |
| CC Slip uploaded | CC Slip | No SMS match, create new | `pending` | **YES** - new transaction |
| 30 days, no CC match | System | Flag unmatched SMS tx | `provisional` → `flagged` | No |
| BIT no match | BIT Screenshot | Flag for user review | `flagged` | No |
| BIT confirmed standalone | User action | Create new transaction | `pending` | **YES** - new transaction |
| BIT/Paybox withdrawal | BIT Screenshot | Mark as reimbursement | `pending` (user categorizes) | No - user decides |

---

# FEATURE 3: Auto-Categorization Agent Integration

## When Does Auto-Categorization Run?

The auto-categorization agent runs at specific points in the transaction lifecycle:

### Trigger Points

| Event | Trigger Auto-Cat? | Rationale |
|-------|-------------------|-----------|
| **SMS creates provisional tx** | **YES** | Immediate categorization for dashboard visibility |
| **Email enriches existing tx** | **Conditional** | Only if email provides better merchant info and tx is still `provisional` or uncategorized |
| **CC Slip confirms SMS tx** | **NO** | Preserve existing category (SMS already categorized) |
| **CC Slip creates new tx** | **YES** | New transaction needs categorization |
| **User manually categorizes** | **NO** | User override = final |
| **BIT standalone confirmed** | **YES** | New transaction from user confirmation |

### Auto-Categorization Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUTO-CATEGORIZATION DECISION TREE                        │
└─────────────────────────────────────────────────────────────────────────────┘

                    New/Updated Transaction
                              │
                              ▼
                ┌──────────────────────────┐
                │ Does tx have a category? │
                └─────────────┬────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
           No Category                Has Category
              │                               │
              ▼                               ▼
    ┌─────────────────┐           ┌─────────────────────────┐
    │ RUN AUTO-CAT    │           │ Was category set by     │
    │ immediately     │           │ user manually?          │
    └─────────────────┘           └───────────┬─────────────┘
                                              │
                                ┌─────────────┴─────────────┐
                                │                           │
                          User Set                    Auto-Set
                                │                           │
                                ▼                           ▼
                      ┌─────────────────┐     ┌─────────────────────────┐
                      │ PRESERVE        │     │ Is new data better?     │
                      │ (never override │     │ (email has merchant     │
                      │  user choice)   │     │  name, SMS had code)    │
                      └─────────────────┘     └───────────┬─────────────┘
                                                          │
                                              ┌───────────┴───────────┐
                                              │                       │
                                          Better                 Same/Worse
                                              │                       │
                                              ▼                       ▼
                                    ┌─────────────────┐     ┌─────────────────┐
                                    │ RE-RUN AUTO-CAT │     │ PRESERVE        │
                                    │ with new info   │     │ existing cat    │
                                    └─────────────────┘     └─────────────────┘
```

### Implementation

```typescript
interface AutoCatContext {
    transaction: Transaction;
    trigger: 'sms_created' | 'email_enriched' | 'cc_created' | 'cc_confirmed' | 'bit_standalone';
    newMerchantInfo?: string;
}

async function shouldRunAutoCategorization(ctx: AutoCatContext): Promise<boolean> {
    const { transaction, trigger, newMerchantInfo } = ctx;

    // Rule 1: User manually set category = NEVER override
    if (transaction.category_source === 'user_manual') {
        return false;
    }

    // Rule 2: CC confirming SMS = preserve SMS category
    if (trigger === 'cc_confirmed' && transaction.status === 'provisional') {
        return false;
    }

    // Rule 3: New transaction = always run
    if (trigger === 'sms_created' || trigger === 'cc_created' || trigger === 'bit_standalone') {
        return true;
    }

    // Rule 4: Email enrichment = only if better merchant info
    if (trigger === 'email_enriched') {
        const currentMerchant = transaction.merchant_normalized || transaction.merchant_raw;
        const newMerchant = newMerchantInfo;

        // Better = longer name, or has Hebrew when current is code
        const isBetter = newMerchant && (
            newMerchant.length > currentMerchant.length ||
            (/[א-ת]/.test(newMerchant) && !/[א-ת]/.test(currentMerchant))
        );

        return isBetter && transaction.category_source !== 'user_manual';
    }

    return false;
}
```

---

# FEATURE 4: Data Supplementation Policy

## Core Principle: Supplement, Never Remove

**NEW DATA ALWAYS ADDS, NEVER DELETES OR OVERWRITES USER DECISIONS**

### Data Layer Model

Each transaction maintains links to all its data sources. When new data arrives, it's ADDED to the transaction record, not replaced.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MASTER TRANSACTION RECORD                            │
│                                                                              │
│  Core Fields (computed from best available source):                         │
│  ─────────────────────────────────────────────────                          │
│  • amount: ₪143.42        ← CC Slip (final authority)                       │
│  • date: 2025-01-29       ← CC Slip (final authority)                       │
│  • merchant: מנורה מבטחים ← SMS (cleanest Hebrew)                           │
│  • category: ביטוח        ← User or Auto-cat (preserved)                    │
│  • spender: R             ← Card mapping                                    │
│                                                                              │
│  Linked Sources (all preserved, viewable in detail):                        │
│  ─────────────────────────────────────────────────                          │
│  ├── 📱 SMS Source                                                          │
│  │   └── merchant: "מנורה מבטחים - חיים"                                   │
│  │   └── amount: 143.42                                                     │
│  │   └── card: 8770                                                         │
│  │   └── raw_message: "שלום, בכרטיסך 8770..."                              │
│  │                                                                          │
│  ├── 📧 Email Receipt                                                       │
│  │   └── merchant: "מנורה מבטחים בע״מ"                                     │
│  │   └── amount: 143.42                                                     │
│  │   └── items: ["פוליסת ביטוח חיים - ינואר"]                             │
│  │   └── pdf_attachment: receipt_123.pdf                                    │
│  │                                                                          │
│  └── 📄 CC Slip Entry                                                       │
│      └── merchant: "MENORA INS 8770"                                        │
│      └── amount: 143.42                                                     │
│      └── source_file: "isracard-jan-2025.csv"                               │
│      └── source_row: 23                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Field Priority Rules (What Data Wins)

| Field | SMS | CC Slip | Email | Winner | Notes |
|-------|-----|---------|-------|--------|-------|
| **Date** | From SMS | From CC | From Email | **CC Slip** | Final authority |
| **Amount** | From SMS | From CC | From Email | **CC Slip** | Always exact |
| **Merchant Name** | Hebrew clean | Code/abbrev | Full name | **SMS > Email > CC** | SMS has cleanest Hebrew |
| **Category** | Auto-cat | Auto-cat | May improve | **User > First Auto-cat** | Preserve user choice |
| **Spender** | From card | From card | N/A | **First detected** | Card mapping |
| **Receipt Details** | N/A | N/A | Items, PDF | **Email** | Additive |
| **Card Ending** | Yes | Sometimes | Rarely | **SMS** | Most reliable |

### What Happens When CC Slip Arrives After SMS Was Categorized

**Scenario**:
1. SMS arrives → creates provisional tx → auto-categorized as "ביטוח"
2. Email arrives → enriches with receipt PDF → category preserved
3. CC Slip arrives → confirms transaction

**Result**:
- Status: `provisional` → `pending` (confirmed)
- Category: **PRESERVED** as "ביטוח" (from step 1)
- Merchant: Kept from SMS (cleaner than CC code)
- Amount/Date: Updated to CC Slip values (final authority)
- New link: CC Slip source added (viewable in detail)

```typescript
async function mergeSmsToCcSlip(
    smsTransaction: Transaction,
    ccSlipData: ParsedCcEntry
): Promise<Transaction> {
    // PRESERVE user/auto-cat category - NEVER override
    const preservedCategory = smsTransaction.category;
    const preservedCategorySource = smsTransaction.category_source;

    // PRESERVE better merchant name (SMS usually cleaner)
    const merchantName = pickBestMerchant(
        smsTransaction.merchant_normalized,
        ccSlipData.merchant
    );

    // UPDATE with CC Slip authority fields
    return await updateTransaction(smsTransaction.id, {
        // CC Slip wins for amount/date (final authority)
        amount: ccSlipData.amount,
        date: ccSlipData.date,

        // SMS wins for merchant (cleaner Hebrew)
        merchant_normalized: merchantName,

        // PRESERVED from original
        category: preservedCategory,
        category_source: preservedCategorySource,

        // Status upgrade
        status: 'pending',  // Confirmed by CC Slip

        // Add CC Slip source link (additive, not replacing SMS link)
        source_file: ccSlipData.filename,
        source_row: ccSlipData.row,
        cc_slip_linked_at: new Date()
    });
}

function pickBestMerchant(smsMerchant: string, ccMerchant: string): string {
    // Prefer Hebrew over codes
    const smsHasHebrew = /[א-ת]/.test(smsMerchant);
    const ccHasHebrew = /[א-ת]/.test(ccMerchant);

    if (smsHasHebrew && !ccHasHebrew) return smsMerchant;
    if (ccHasHebrew && !smsHasHebrew) return ccMerchant;

    // Prefer longer name (more descriptive)
    return smsMerchant.length >= ccMerchant.length ? smsMerchant : ccMerchant;
}
```

### Conflict Handling

| Conflict | Resolution | Show Warning? |
|----------|------------|---------------|
| Amount mismatch (SMS vs CC) | CC Slip wins | Yes - show in detail view |
| Date mismatch (SMS vs CC) | CC Slip wins | No - minor variance expected |
| Merchant different | SMS wins (cleaner) | No |
| Category already set | PRESERVE | No |
| User category vs auto-cat | User ALWAYS wins | No |

---

# FEATURE 5: Master Transaction + Sub-Transactions (Source Attribution)

## Database Schema

```sql
-- Track which sources contributed to each transaction
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS sms_id UUID REFERENCES sms_transactions(id),
ADD COLUMN IF NOT EXISTS source_file TEXT,      -- Original filename for CC slip
ADD COLUMN IF NOT EXISTS source_row INTEGER,    -- Row number in source file
ADD COLUMN IF NOT EXISTS cc_slip_linked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS category_source TEXT CHECK (category_source IN ('auto', 'user_manual', 'rule')),
ADD COLUMN IF NOT EXISTS source_priority TEXT DEFAULT 'cc_slip'
    CHECK (source_priority IN ('sms', 'cc_slip', 'bank', 'bit_standalone'));

-- email_receipts already has matched_transaction_id
-- bit_transactions (existing) already links to transactions
```

## Transaction Detail View UI

When a user clicks on a transaction row, they see a detail panel showing the master transaction and all linked sources:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Transactions                                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  💳 Transaction Details                                              │   │
│  │                                                                      │   │
│  │  Amount:     ₪143.42                                                │   │
│  │  Date:       29/01/2025                                             │   │
│  │  Merchant:   מנורה מבטחים - חיים                                    │   │
│  │  Category:   ביטוח                 [Edit]                           │   │
│  │  Who:        R (Roy)                                                │   │
│  │  Status:     ✓ Verified                                             │   │
│  │  Card:       ****8770                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  📊 Data Sources (3)                                    [Timeline ▼] │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ 📱 SMS (Primary)                           29/01 10:00am    │    │   │
│  │  │                                                             │    │   │
│  │  │ Provider: Isracard                                          │    │   │
│  │  │ Amount:   ₪143.42                                          │    │   │
│  │  │ Merchant: מנורה מבטחים - חיים                               │    │   │
│  │  │ Card:     8770                                              │    │   │
│  │  │                                                             │    │   │
│  │  │ Raw: "שלום, בכרטיסך 8770 אושרה עסקה ב-29/01 בסך 143.42..."  │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ 📧 Email Receipt                           29/01 10:05am    │    │   │
│  │  │                                                             │    │   │
│  │  │ From:     receipts@menora.co.il                             │    │   │
│  │  │ Subject:  קבלה על תשלום פוליסה                              │    │   │
│  │  │ Amount:   ₪143.42                                          │    │   │
│  │  │                                                             │    │   │
│  │  │ Extracted Items:                                            │    │   │
│  │  │   • פוליסת ביטוח חיים - ינואר 2025                         │    │   │
│  │  │                                                             │    │   │
│  │  │ [View Original Email] [View PDF Attachment]                 │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ 📄 CC Slip (Confirmed)                     Uploaded Week 3   │    │   │
│  │  │                                                             │    │   │
│  │  │ File:     isracard-jan-2025.csv                             │    │   │
│  │  │ Row:      Line 23                                           │    │   │
│  │  │ Amount:   ₪143.42                                          │    │   │
│  │  │ Merchant: MENORA INS 8770                                   │    │   │
│  │  │ Date:     29/01/2025                                        │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [Edit Category]  [Add Note]  [Mark as Reimbursement]  [Delete]     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Source Types to Display

| Source Type | Icon | Fields to Show |
|-------------|------|----------------|
| **SMS** | 📱 | Provider, Amount, Merchant, Card, Raw message, Timestamp |
| **Email Receipt** | 📧 | From, Subject, Amount, Extracted items, Attachments |
| **CC Slip** | 📄 | Filename, Row number, Amount, Merchant code, Date |
| **BIT/Paybox** | 🔄 | Recipient/Sender, Amount, Reference, Screenshot link |
| **Bank Statement** | 🏦 | Account, Amount, Description, Balance after |

### Implementation Notes

1. **Preserve all existing transaction page functionality**:
   - Categorization
   - Bulk actions
   - Filtering
   - Status changes
   - Notes
   - Reimbursement marking

2. **Source attribution is read-only** - shows provenance, not editable

3. **Expandable sections** - Start collapsed, user can expand each source

4. **Timeline view** - Sources shown in chronological order (SMS → Email → CC Slip)

5. **Highlight data conflicts** - If SMS says ₪143.42 but CC says ₪143.00, show both with warning icon

---

# FEATURE 6: Dashboard Changes

## Monthly Expenses Bar Chart

**Current**: Single color bars per month

**New**: Stacked bars showing R vs N contribution

```
Jan  [███████████░░░░░] R: ₪8,500 | N: ₪4,200
Feb  [█████████░░░░░░░] R: ₪7,200 | N: ₪5,100
Mar  [████████████░░░░] R: ₪9,100 | N: ₪3,800
```

**Toggle options**:
- Combined (stacked)
- Side-by-side
- R only
- N only

## Category Breakdown Pie Chart

**Current**: Single pie showing all categories

**New**:
- Add spender filter toggle (All / R / N)
- Or show side-by-side comparison mode

```
┌───────────────────────────────────────────────────┐
│ Category Breakdown           [All ▼] [R] [N]     │
│                                                   │
│        [===== PIE CHART =====]                   │
│                                                   │
│  מזון ומכולת     ₪3,200  (25%)                   │
│  תחבורה         ₪2,100  (16%)                   │
│  ביטוח          ₪1,800  (14%)                   │
│  ...                                             │
└───────────────────────────────────────────────────┘
```

## New Widget: Spender Summary

```
┌─────────────────────────────────┐
│ 👥 This Month by Person         │
│                                 │
│ R (Roy)      ₪12,450  (62%)    │
│ ████████████░░░░░░░░           │
│                                 │
│ N (Noa)       ₪7,650  (38%)    │
│ ███████░░░░░░░░░░░░░           │
│                                 │
│ [View breakdown →]             │
└─────────────────────────────────┘
```

## Transaction Status Overview

**New**: Show provisional vs confirmed breakdown

```
┌─────────────────────────────────┐
│ 📊 Transaction Sources          │
│                                 │
│ This Month:                     │
│ • 47 from SMS (real-time)       │
│ • 52 from CC Slip (confirmed)   │
│ • 12 from Bank Statement        │
│ • 3 pending confirmation        │
│                                 │
│ Data freshness: 2 hours ago     │
└─────────────────────────────────┘
```

## Trend Line by Spender

**New chart**: Monthly spending trend per spender

```
₪15K ┤
     │     R ──────
₪10K ┤    ╱    ╲
     │   ╱      ╲   ╱
₪5K  ┤  ╱   N ──╲──╱──
     │ ╱         ╲╱
  ₪0 ┼──────────────────────────────
     Jan  Feb  Mar  Apr  May  Jun
```

## Components to Update

| Component | Changes |
|-----------|---------|
| `MonthlyExpensesChart.tsx` | Add stacked bars by spender, toggle controls |
| `CategoryBreakdown.tsx` | Add spender filter, comparison mode |
| `DashboardSummary.tsx` | Add spender summary widget |
| `TransactionStatusWidget.tsx` | NEW - show source breakdown |
| `SpenderTrendChart.tsx` | NEW - trend line per spender |
| `DashboardFilters.tsx` | Add global spender filter that affects all widgets |

---

# SMS Processing Details

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

## SMS Parsing Patterns

```typescript
type CardProvider = 'isracard' | 'cal' | 'max' | 'leumi' | 'unknown';

const PATTERNS: Record<CardProvider, {
    cardEnding: RegExp;
    amount: RegExp;
    merchant: RegExp;
    date?: RegExp;
}> = {
    isracard: {
        cardEnding: /בכרטיסך(?:\s+המסתיים\s+ב-)?\s*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)\s*(ש"ח|ILS)?/,
        merchant: /(?:ב-?|ב)([^.]+?)(?:\s*\.|\s*למידע|$)/,
        date: /ב-?\s*(\d{1,2})\/(\d{1,2})/
    },
    cal: {
        cardEnding: /\*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)\s*ש"ח/,
        merchant: /ב-([^*]+?)(?:\s*\*|\s*$)/,
        date: /(\d{1,2})\/(\d{1,2})/
    },
    max: {
        cardEnding: /\*(\d{4})/,
        amount: /בסך\s+([\d,]+\.?\d*)\s*ש"ח/,
        merchant: /ב([^*]+?)\s*\*/,
    },
    leumi: {
        cardEnding: /כרטיס\s*(\d{4})/,
        amount: /([\d,]+\.?\d*)\s*ש"ח/,
        merchant: /ש"ח\s*-\s*(.+?)(?:\s*$|\s*\.)/,
    },
    unknown: {
        cardEnding: /(\d{4})/,
        amount: /([\d,]+\.?\d*)\s*(ש"ח|ILS)/,
        merchant: /ב-?([א-ת\w\s.-]+)/,
    }
};
```

## Matching Algorithm: SMS → CC Slip

```typescript
interface MatchCriteria {
    amount: { exact: true, tolerance: 0.01 };  // ₪0.01 for rounding
    date: { daysTolerance: 1 };                 // SMS date ±1 day of CC date
    cardEnding: { required: false };            // If both have card, must match
    merchant: { fuzzyMatch: true };             // Hebrew ↔ English mapping
}

async function matchCcSlipToSms(ccTransaction: ParsedTransaction): Promise<SmsMatch | null> {
    // 1. Find SMS candidates within date range
    const candidates = await db.sms_transactions
        .where('transaction_date').between(ccDate - 1, ccDate + 1)
        .where('amount').equals(ccAmount)
        .where('cc_matched').equals(false);

    // 2. Score each candidate
    for (const sms of candidates) {
        let score = 0;

        // Exact amount = required
        if (Math.abs(sms.amount - ccTransaction.amount) < 0.01) score += 50;
        else continue;  // Skip if amount doesn't match

        // Same day = +30, ±1 day = +20
        const dayDiff = Math.abs(daysBetween(sms.date, ccTransaction.date));
        if (dayDiff === 0) score += 30;
        else if (dayDiff === 1) score += 20;
        else continue;  // Skip if outside date range

        // Card ending matches = +15
        if (sms.cardEnding && ccTransaction.cardEnding) {
            if (sms.cardEnding === ccTransaction.cardEnding) score += 15;
            else continue;  // Different cards = no match
        }

        // Merchant fuzzy match = +5 bonus (not required)
        if (merchantsMatch(sms.merchant, ccTransaction.merchant)) score += 5;

        if (score >= 80) return { sms, score, confidence: score };
    }

    return null;  // No match found
}
```

---

# Implementation Summary

## New Database Tables

| Table | Purpose |
|-------|---------|
| `household_spenders` | Spender configuration per household |
| `household_card_mappings` | Map card endings to spenders (R/N) |
| `sms_transactions` | Store incoming SMS with dedup tracking |

## Modified Database Tables

| Table | Changes |
|-------|---------|
| `transactions` | Add `spender`, `sms_id`, `source_file`, `source_row`, `category_source`, `provisional` status |
| `email_receipts` | Add `source_type`, `card_ending` columns |

## New Files

| File | Purpose |
|------|---------|
| `/app/actions/parse-sms-receipt.ts` | SMS parsing with multi-provider regex |
| `/app/actions/sms-deduplication.ts` | Dedup logic for SMS vs CC slip |
| `/app/actions/spender-detection.ts` | Auto-detect spender from card ending |
| `/app/actions/auto-categorization-trigger.ts` | Logic for when to run auto-cat |
| `/supabase/migrations/20260131000000_spender_and_sms.sql` | All schema changes |
| `/components/upload/SpenderSelector.tsx` | Upload page spender selection UI |
| `/components/analytics/SpenderBreakdown.tsx` | Analytics spender visualization |
| `/components/transactions/TransactionDetail.tsx` | Master tx + source attribution view |
| `/components/dashboard/SpenderSummaryWidget.tsx` | Spender summary widget |
| `/components/dashboard/TransactionSourceWidget.tsx` | Source breakdown widget |
| `/components/dashboard/SpenderTrendChart.tsx` | Trend line by spender |

## Modified Files

| File | Changes |
|------|---------|
| `/app/api/email/receive/route.ts` | Detect SMS, route to SMS parser |
| `/app/upload/page.tsx` | Add spender selection UI |
| `/app/transactions/page.tsx` | Add "Who" column, spender filter, detail view |
| `/app/dashboard/page.tsx` | Add new widgets, spender filters |
| `/app/actions/save-transactions.ts` | Handle spender field, source links |
| `/app/actions/match-receipts.ts` | Add SMS matching function |
| `/app/actions/run-auto-categorization.ts` | Add trigger checks |
| `/components/dashboard/MonthlyExpensesChart.tsx` | Stacked bars by spender |
| `/components/dashboard/CategoryBreakdown.tsx` | Spender filter toggle |

---

## Verification Steps

### Feature 1: Spender Tracking
1. Upload CC slip with card 8770 → transactions tagged as R
2. Upload CC slip with card 8937 → transactions tagged as N
3. Upload unknown card → prompted for spender selection
4. Transaction page shows "Who" column correctly
5. Analytics charts show spender breakdown
6. Filter by spender works

### Feature 2: SMS + Deduplication
1. Forward Isracard SMS → stored in sms_transactions
2. SMS creates provisional transaction (visible in UI)
3. Upload CC slip with matching transaction → merges correctly
4. SMS marked as "matched"
5. Transaction keeps SMS merchant name (cleaner)
6. Duplicate SMS forwarded → ignored
7. Unmatched provisional after 30 days → flagged

### Feature 3: Auto-Categorization
1. SMS creates tx → auto-cat runs immediately
2. CC slip confirms SMS tx → category PRESERVED
3. Email enriches tx with better merchant → re-categorize if auto-cat was source
4. User manually sets category → NEVER overridden

### Feature 4: Data Supplementation
1. SMS tx gets category → category preserved when CC confirms
2. CC slip adds new fields → SMS fields preserved
3. Email adds receipt details → existing data preserved
4. All sources visible in transaction detail

### Feature 5: Master/Sub-Transaction View
1. Click transaction created from SMS only → shows SMS source
2. Click transaction with SMS + Email → shows both sources in timeline
3. Click transaction with SMS + CC slip → shows both, CC marked as "confirmed"
4. Click transaction with all 3 sources → shows complete audit trail
5. All existing transaction actions still work (categorize, note, delete, etc.)

### Feature 6: Dashboard
1. Monthly chart shows stacked bars by spender
2. Category breakdown has spender filter
3. Spender summary widget shows correct totals
4. Transaction source widget shows SMS/CC/Bank breakdown
5. Trend line shows per-spender spending over time

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
