# Supabase Setup Instructions

## Prerequisites

Before you can use the authentication features, you need to set up Supabase.

## Step-by-Step Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign in with GitHub (or create an account)
4. Click "New Project"
5. Fill in:
   - **Name**: `household-finance` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to you
6. Click "Create new project"
7. Wait 2-3 minutes for the project to be created

### 2. Get Your API Credentials

1. In your Supabase project dashboard, click on the **Settings** icon (⚙️) in the sidebar
2. Click **API** in the settings menu
3. You'll see two important values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")
4. Copy these values - you'll need them in the next step

### 3. Configure Environment Variables

1. In your project root, create a file called `.env.local`:
   ```bash
   cp env.example .env.local
   ```

2. Open `.env.local` and fill in your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

3. To get the **service_role** key:
   - In Supabase dashboard, go to Settings → API
   - Scroll down to "Project API keys"
   - Copy the `service_role` key (⚠️ Keep this secret!)

### 4. Run Database Migrations

1. In your Supabase project dashboard, click on the **SQL Editor** icon in the sidebar
2. Click "New query"
3. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Paste into the SQL editor
5. Click "Run" (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned"

### 5. Seed Categories

1. Still in the SQL Editor, click "New query" again
2. Copy the entire contents of `supabase/seed/categories.sql`
3. Paste into the SQL editor
4. Click "Run"
5. You should see "Success. 31 rows returned" (25 expense + 6 income categories)

### 6. Enable Google OAuth

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find "Google" in the list and click to expand
3. Toggle "Enable Sign in with Google" to ON
4. You'll need to create a Google OAuth app:

   **Create Google OAuth Credentials:**
   1. Go to [Google Cloud Console](https://console.cloud.google.com/)
   2. Create a new project (or select existing)
   3. Go to "APIs & Services" → "Credentials"
   4. Click "Create Credentials" → "OAuth 2.0 Client ID"
   5. Configure consent screen if prompted
   6. Application type: "Web application"
   7. Add authorized redirect URIs:
      - `https://your-project-id.supabase.co/auth/v1/callback`
      - `http://localhost:3000/auth/callback` (for local development)
   8. Copy the **Client ID** and **Client Secret**

5. Back in Supabase, paste your Google OAuth credentials:
   - **Client ID**: Paste from Google Cloud Console
   - **Client Secret**: Paste from Google Cloud Console
6. Click "Save"

### 7. Restart Your Development Server

1. Stop the dev server (Ctrl+C in terminal)
2. Start it again:
   ```bash
   npm run dev
   ```

3. The app should now load without errors!

### 8. Test Authentication

1. Navigate to `http://localhost:3000/login`
2. Click "Sign in with Google"
3. Complete Google OAuth flow
4. You'll be redirected back to the app

**Note:** On first login, you'll need to create a user profile with a master password. This feature will be added in the next phase.

---

## Troubleshooting

### "Your project's URL and Key are required"
- Make sure `.env.local` exists and has the correct values
- Restart the dev server after creating/editing `.env.local`

### "Invalid API key"
- Double-check you copied the correct keys from Supabase
- Make sure there are no extra spaces or quotes

### Google OAuth not working
- Verify redirect URIs match exactly in Google Cloud Console
- Check that Google provider is enabled in Supabase
- Make sure Client ID and Secret are correct

### Database errors
- Verify migrations ran successfully in SQL Editor
- Check that all tables were created (households, user_profiles, transactions, etc.)
- Ensure RLS policies are enabled

---

## What's Next?

Once Supabase is configured, you can:
1. Test the login flow
2. Create your first household and user profile
3. Start uploading financial data

See [README.md](file:///Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/README.md) for full usage instructions.
