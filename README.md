# CheckIn RW

NLS Christian Fellowship attendance MIS built with Next.js and Supabase.

## Run locally

1. Install Node.js, then run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase values.
3. Run `npm run dev` and open `http://localhost:3000`.

## Deploy to Vercel

Import `Ayamikani-Rukundo/CheckIn-RW` in Vercel. The project is configured as a Next.js app; its routes are served by Next.js, so refreshing a route such as `/dashboard` does not require a separate SPA rewrite.

Add these environment variables in the Vercel project settings using the values from `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never add `.env.local` or its values to Git.

The access migration promotes the earliest existing profile to the initial Super Admin if no Super Admin exists yet.

Before using the invitation manager, run `supabase/migrations/20261125190000_invitation_permissions.sql` once in the existing Supabase SQL Editor. It adds invitation access settings and makes claimed codes apply those permissions to new accounts.
