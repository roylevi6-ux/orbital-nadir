# Household Finance Aggregation App 💰

A personal finance aggregation app for household owners that automatically ingests financial data from multiple sources, intelligently categorizes transactions with Hebrew support, handles Israeli P2P payment reconciliation (BIT/Paybox), and provides AI-powered insights.

## Features

- 📊 **Multi-Source Data Ingestion**: Google Sheets, Excel, CSV, PDF bank statements, BIT/Paybox screenshots
- 🤖 **AI-Powered Categorization**: Automatic transaction categorization with confidence scoring
- 🇮🇱 **Full Hebrew Support**: RTL layout, Hebrew merchant names, bilingual UI
- 🔄 **Smart Deduplication**: BIT/Paybox ↔ Credit Card reconciliation
- 💡 **Intelligent Insights**: Natural language queries, anomaly detection, trend analysis
- 🔐 **Secure**: Google OAuth + master password, Row Level Security (RLS)
- 📱 **Responsive**: Web + Mobile Web support

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **AI**: Hybrid approach (rule-based + AI enhancement)
- **Parsing**: xlsx, papaparse, pdf-parse, OCR
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account

### Installation

1. **Clone the repository** (or you're already here!)

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Supabase**:
   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Copy your project URL and anon key
   - Run the database migration:
     - Go to SQL Editor in Supabase Dashboard
     - Copy and run `supabase/migrations/001_initial_schema.sql`
     - Then run `supabase/seed/categories.sql`

4. **Configure environment variables**:
   - Copy `env.example` to `.env.local`:
     ```bash
     cp env.example .env.local
     ```
   - Fill in your Supabase credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

5. **Enable Google OAuth in Supabase**:
   - Go to Authentication → Providers in Supabase Dashboard
   - Enable Google provider
   - Add your Google OAuth credentials

6. **Run the development server**:
   ```bash
   npm run dev
   ```

7. **Open [http://localhost:3000](http://localhost:3000)** in your browser

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Homepage
│   ├── login/             # Login page
│   ├── dashboard/         # Main dashboard
│   ├── upload/            # File upload hub
│   └── settings/          # Settings page
├── components/            # React components
├── lib/                   # Core utilities
│   ├── auth/             # Authentication & master password
│   ├── parsers/          # File parsers (Excel, CSV, PDF, OCR)
│   ├── intake/           # Categorization & deduplication logic
│   ├── insights/         # BI & analytics
│   ├── export/           # Export functionality
│   └── notifications/    # Email notifications
├── supabase/
│   ├── migrations/       # Database schema
│   └── seed/            # Seed data (categories)
├── docs/                 # Documentation (PRD)
└── public/              # Static assets
```

## Database Schema

The app uses PostgreSQL (via Supabase) with the following main tables:

- **households**: Links 2 users together
- **user_profiles**: User settings and master password
- **transactions**: All financial transactions
- **categories**: 25 expense + 6 income categories
- **merchant_memory**: Household-specific merchant → category learning
- **source_mappings**: Saved column mappings for file uploads
- **skip_queue**: Transactions deferred for later categorization

All tables have Row Level Security (RLS) enabled to ensure users only access their household data.

## Usage

### First-Time Setup

1. **Sign in with Google** and create a master password
2. **Upload historical data** (Google Sheets with 6+ months recommended)
3. **Confirm column mapping** for your data sources
4. **Review and correct** any miscategorized transactions
5. The system learns from your corrections!

### Monthly Workflow

1. **Upload new data** (CC statements, bank statements, BIT/Paybox screenshots)
2. **Review flagged transactions** (low confidence categorizations)
3. **Confirm deduplication** matches (BIT/Paybox ↔ CC)
4. **Classify reimbursements** (income vs. expense offset)
5. **View insights** in the BI dashboard

## Categories

### Expense Categories (25)
מצרכים, פירות וירקות, בשר ודגים, סופר פארם, אוכל בחוץ, ביזבוזים, הוצאות דיור, ביטוחים ובריאות, השכלה, משכנתא, טיפוח עצמי, פנאי, טיפולים אישיים, נותני שירות, תחבורה, נסיעות עסקיות, חוב ועלויות פיננסיות, חסכונות, טיולים וחופשות, בל"מ ומתנות, הוצאה לא ידועה בכרטיס, הוצאה לא ידועה במזומן, ועדים, תרומות, חתולים

### Income Categories (6)
משכורת, הכנסה חד פעמית/בונוס, משיכה מחסכונות, תמיכה ממשפחה, מתנה, קצבאות

## Development Status

This is an MVP (Minimum Viable Product) currently in active development. See `task.md` for the development roadmap.

### Completed ✅
- [x] Project setup and infrastructure
- [x] Database schema with RLS
- [x] Category seed data
- [x] Authentication utilities
- [x] Welcome page

### In Progress 🚧
- [ ] Login page with Google OAuth + master password
- [ ] File upload and parsing
- [ ] Categorization engine
- [ ] BI Dashboard
- [ ] AI insights

## Contributing

This is a private household finance app for 2 users. Not currently accepting external contributions.

## License

Private project - All rights reserved

## Support

For questions or issues, please refer to the PRD documentation in `docs/prd.md`.
