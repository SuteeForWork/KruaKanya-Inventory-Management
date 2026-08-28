# Deploying — free-tier database + hosting

This app is a static site (no build step, no server). Deploying it is just
publishing the files; the database is a separate service the frontend talks
to directly. Two accounts are needed and **only you can create them** — see
"Why I can't do this part" below.

## The stack

| Layer | Choice | Why |
| --- | --- | --- |
| Hosting | **Cloudflare Pages** | No bandwidth cap on the free plan, no ban on commercial use, deploys straight from a git push |
| Database + auth | **Supabase** | Postgres matches this app's relational data (lots reference items/branches, moves reference lots, recipes have line items); built-in Auth + Row Level Security means the browser can talk to it directly with no backend server to host or maintain |

Both plans require no credit card to start.

## What's already done

- [`db/schema.sql`](db/schema.sql) — the full table structure (branches,
  suppliers, items, lots, moves, outputs, recipes, role permissions, user
  profiles), plus starter Row Level Security policies. Paste this into
  Supabase's SQL Editor once the project exists.
- [`.gitignore`](.gitignore) — keeps a future `.env` (Supabase keys) out of
  version control.
- A local git repository with the current code committed, ready to push.

## What only you can do

I can't create accounts, agree to terms of service, or hold credentials on
your behalf — that's a hard rule for me, not a policy I can skip even if
asked. These steps take about 10 minutes combined.

### 1. Create the database (Supabase)

1. Go to <https://supabase.com>, sign up (GitHub login is the fastest), and
   create a new project — pick a region close to your users (e.g.
   Singapore for Thailand).
2. Open **SQL Editor → New query**, paste the contents of
   [`db/schema.sql`](db/schema.sql), and run it.
3. Open **Project Settings → API** and copy the **Project URL** and the
   **anon public key**. Send those two values back to me (they are safe to
   share — the anon key is meant to be public; it's the Row Level Security
   policies in `schema.sql` that keep data safe, not secrecy of this key).

Free tier: 500 MB database, 50,000 monthly active auth users, 5 GB egress,
1 GB file storage. A project pauses itself after 7 days with no API calls
(one click to resume, no data loss) — a fine trade for daily kitchen use.

### 2. Put the code on GitHub

```bash
cd "/Users/kanya/Claude Code/KruaKanya Inventory Management"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

(Create the empty repo first at <https://github.com/new> — no need to check
any of the README/license/gitignore boxes, this repo already has those.)

### 3. Deploy it (Cloudflare Pages)

1. Go to <https://dash.cloudflare.com>, sign up, and open **Workers & Pages
   → Create → Pages → Connect to Git**.
2. Pick the repo you just pushed. Leave **Build command** empty and **Build
   output directory** as `/` (this is a static site — nothing to build).
3. Click **Save and Deploy**. It's live at `<project>.pages.dev` within
   about a minute, and every future `git push` redeploys automatically.
4. Optional: **Custom domains** tab to point your own domain at it, still
   free.

## Once you have the Supabase URL + anon key

Send them to me and I'll wire `src/core/store.js` to read and write through
Supabase instead of the in-memory seed — that's a real rewrite (every action
becomes an async network call, plus migrating `src/core/access.js`'s
plaintext demo accounts to Supabase Auth), so it's worth doing as its own
pass with its own testing rather than guessing at it now without a live
project to test against.
