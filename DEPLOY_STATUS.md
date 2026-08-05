# Deploy status — acai-stock

_Prepared 2026-08-05 while you were away. Autonomous deploy was not possible: the three CLIs needed for the end-to-end path (`gh`, `vercel`, `supabase`) are not installed on this laptop, so there was no way to authenticate or push code without you signing in yourself._

---

## What is already done

- [x] `acai-stock.zip` unzipped to `C:\Users\GUS-SM-PTY\Desktop\acai-stock\`.
- [x] Shape verified: Next.js 14 App Router + Supabase SSR, PWA (`public/sw.js`, `manifest.webmanifest`), migrations in `supabase/migrations/`.
- [x] `supabase/migrations/001_schema.sql` and `002_seed.sql` opened and read end to end — valid Postgres, 8 tables, RLS policies, `submit_count` RPC, seed for **Loja 1** + full product catalog. Safe to commit to a **private** repo.
- [x] `git init -b main` inside `acai-stock/`.
- [x] Local git identity set (repo-scoped only): `eng.gustavo.s@gmail.com` / "Gustavo Salgado Martins". No global config was changed.
- [x] All 44 files staged and committed:
  - Commit: `1f37178` — _"Initial commit: acai-stock Next.js + Supabase PWA"_
- [x] No remote configured yet (nothing has been pushed anywhere).

## Machine state that determined the handoff

Verified via a temporary batch script run from Desktop (log kept as `_acai_deploy_log2.txt`):

| Tool | Status |
|---|---|
| `git` | installed — 2.54.0.windows.1 |
| `node` | installed — v24.15.0 |
| `npm` | installed — 11.12.1 |
| `gh` (GitHub CLI) | **not installed** |
| `vercel` | **not installed** |
| `supabase` | **not installed** |
| `~/.vercel`, `%APPDATA%\gh`, `%APPDATA%\supabase` | none present |

Because no CLI was authenticated, Part 4 of the original plan (fully scripted push) was not attempted. Account creation, email verification, and password entry must be done by you.

---

## What you need to do (est. 15–20 min)

### 1. Install the CLIs (one-time, ~3 min)

Open **PowerShell** (Start → "PowerShell") and paste:

```powershell
winget install --id GitHub.cli -e
winget install --id Supabase.CLI -e
npm i -g vercel
```

Close and reopen PowerShell so the new PATH entries load. Then:

```powershell
gh --version
vercel --version
supabase --version
```

All three should print a version.

### 2. Supabase — create the project (browser, ~5 min)

The Supabase CLI still can't create a project non-interactively, so use the dashboard:

1. Go to <https://supabase.com/dashboard>, sign in / sign up.
2. **New project** → name `acai-stock`, region **West EU (Ireland)**, choose a strong DB password (save it in your password manager).
3. Wait for provisioning (~1 min).
4. **SQL Editor → New query** → paste the contents of `supabase/migrations/001_schema.sql` → Run.
5. New query → paste `supabase/migrations/002_seed.sql` → Run.
6. **Authentication → Providers → Email** → toggle **Confirm email** OFF.
7. **Settings → API** — copy the two values you'll need:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Keep both handy. Then create your admin user per README §1 (Authentication → Users → Add user → Auto Confirm; then the `insert into profiles` SQL with your UUID).

### 3. GitHub — push the code (~2 min)

Back in PowerShell:

```powershell
cd C:\Users\GUS-SM-PTY\Desktop\acai-stock
gh auth login    # choose GitHub.com → HTTPS → Login with a web browser → paste the code
gh repo create acai-stock --private --source=. --push
```

The **`--private`** flag is important — the seed migration commits your product catalog with Portuguese names, so keep the repo private.

### 4. Vercel — deploy (~5 min)

Still in the `acai-stock` folder:

```powershell
vercel login       # opens the browser
vercel link        # pick your account → "Link to existing project? No" → name: acai-stock → framework auto-detected as Next.js
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# paste the Project URL from step 2, press Enter
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# paste the anon key, press Enter
vercel --prod
```

The last command prints the live URL, e.g. `https://acai-stock-xxxx.vercel.app`. Open it on your phone to smoke-test.

### 5. Optional cleanup

Once everything works, these scratch files on the Desktop can be deleted:

- `_acai_deploy.bat`, `_acai_deploy2.bat`, `_acai_git_init.bat`
- `_acai_deploy_log.txt`, `_acai_deploy_log2.txt`, `_acai_git_log.txt`
- `acai-stock.zip` (source is now in `acai-stock/` and in your GitHub repo)

---

## If anything fails

- **`vercel --prod` build error about missing env vars** — you skipped step 4's `vercel env add` lines. Rerun them, then `vercel --prod` again.
- **App loads but login fails** — Supabase Auth "Confirm email" was left on, or you haven't created the admin user yet (README §1 "Criar o utilizador admin").
- **`gh repo create` says name is taken** — pick another slug: `gh repo create acai-stock-app --private --source=. --push`.

## What I did NOT do (and why)

- Did not install the CLIs (`winget install …` prompts UAC and shouldn't be silently automated on your behalf).
- Did not create a GitHub, Vercel, or Supabase account — email verification and password ownership have to sit with you.
- Did not push anything to any public host. The local commit is on branch `main`, no remotes.
