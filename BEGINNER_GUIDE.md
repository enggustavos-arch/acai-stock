# Beginner walkthrough — put acai-stock online

You've never done this before. That's fine. Follow this in order, top to bottom. Don't skip ahead. About 30 min total.

## What you're actually doing

Three online services will host your app. You need an account on each — all free for what you need.

- **Supabase** — stores your data (products, counts, users, passwords). It's your database.
- **GitHub** — stores a copy of your code files. Vercel reads from here.
- **Vercel** — takes your code and turns it into a real website at a URL you can share.

You'll create the three accounts in the browser, then run a handful of commands in a terminal window. When you hit a command block below, you copy the whole block (including all the lines) and paste it into PowerShell.

## Before you start

- Have ~30 uninterrupted minutes.
- Have your phone nearby (for a quick test at the end).
- Have somewhere to write down passwords and keys as you go — the notes app, a password manager, whatever. You'll need them in later steps.

---

## Step 0 — Open PowerShell

1. Press the **Windows key**, type `powershell`.
2. Click **Windows PowerShell** (the blue icon, not the ISE one).
3. A dark blue/black window opens with a blinking cursor. That's your terminal.

Everything below that says "run this" or "paste this" happens in that window. To paste: **right-click** inside the window (nothing visible happens — that IS the paste), then press **Enter**. Or use **Ctrl+Shift+V**.

**Keep this window open the whole time. Don't close it between steps.**

---

## Step 1 — Install the three tools (~3 min)

Paste each block into PowerShell, press Enter, wait for it to finish before pasting the next one.

Block 1 — install GitHub CLI:
```powershell
winget install --id GitHub.cli -e
```
You may see a UAC popup ("Do you want to allow this app…") — click **Yes**. Then a license prompt appears — type `Y` and Enter. Wait until you see "Successfully installed".

Block 2 — install Supabase CLI:
```powershell
winget install --id Supabase.CLI -e
```
Same drill: **Yes** on UAC, `Y` on license, wait.

Block 3 — install Vercel CLI:
```powershell
npm i -g vercel
```
This runs for ~30 seconds. You'll see a lot of scrolling text; that's normal. Wait until the prompt (the `PS C:\...>` line) comes back.

**Now close PowerShell and open a fresh one** (Windows key → `powershell` → click). This is important — it makes Windows notice the new tools.

Sanity-check they're all there:
```powershell
gh --version
vercel --version
supabase --version
```
Each should print a version number. If any says "not recognized", close and reopen PowerShell one more time and try again. If still broken, tell me which one failed.

---

## Step 2 — Create the Supabase project (~10 min)

This part is all in the browser.

1. Open <https://supabase.com/dashboard> in Chrome. Click **Start your project** or **Sign in** — sign up with your Google account or email. If it emails you a confirmation, click the link.

2. Once you're in the dashboard, click **New project** (top-right green button).
   - **Name:** `acai-stock`
   - **Database password:** click **Generate a password**, then **copy it and paste it into your notes app**. You need this if you ever restore the database — save it now.
   - **Region:** `West EU (Ireland)` (closest to Portugal)
   - **Plan:** Free
   - Click **Create new project**.

3. Wait 1–2 minutes for it to finish setting up. You'll see a green checkmark when ready.

4. In the left sidebar, click **SQL Editor** → **+ New query** (top of the page). A big empty text box appears.

5. Open a second browser tab or File Explorer and go to:
   `C:\Users\GUS-SM-PTY\Desktop\acai-stock\supabase\migrations\`
   Open `001_schema.sql` in Notepad (right-click → Open with → Notepad). Select all (Ctrl+A) → copy (Ctrl+C).

6. Back in the Supabase SQL Editor, click in the big text box and paste (Ctrl+V). Click the green **Run** button (bottom-right). Wait for "Success. No rows returned." That means it worked.

7. Click **+ New query** again. Open `002_seed.sql` in Notepad → select all → copy → paste into the new query box → **Run**. Wait for success.

8. Left sidebar → **Authentication** → **Providers**. Find the **Email** row, click it. Toggle **Confirm email** to **OFF**. Click **Save** at the bottom.

9. Left sidebar → **Project Settings** (gear icon) → **API**. You need two values from this page. **Copy each one to your notes app right now** — you'll paste them into Vercel later:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`) — this is your `NEXT_PUBLIC_SUPABASE_URL`.
   - Under **Project API keys**, the one labeled **anon** **public** — this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It's a very long string starting with `eyJ...`.

**Do not share the second key publicly, but it IS meant to go in the app.** (There's a third key called `service_role` — never use that one. Ignore it.)

10. Create your admin account. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
    - Email: your real email.
    - Password: a strong one — save it in your notes.
    - **Tick "Auto Confirm User"**.
    - Click **Create user**.
    - The user appears in the list. Click on them and copy the **UUID** (long string like `a1b2c3d4-...`) — save it too.

11. One more SQL query to mark yourself as admin. Left sidebar → **SQL Editor** → **+ New query**, paste this (replace `PASTE-YOUR-UUID-HERE` with the UUID from step 10):
    ```sql
    insert into public.profiles (user_id, role)
    values ('PASTE-YOUR-UUID-HERE', 'admin');
    ```
    Click **Run**. You should see "Success. No rows returned."

Supabase is done. You can leave the tab open.

---

## Step 3 — Push code to GitHub (~3 min)

Back in PowerShell. First, move into the app folder:

```powershell
cd C:\Users\GUS-SM-PTY\Desktop\acai-stock
```

Log in to GitHub:

```powershell
gh auth login
```

It asks a series of questions — use the arrow keys to pick and Enter to confirm:
- **What account?** → GitHub.com
- **Preferred protocol?** → HTTPS
- **Authenticate with your GitHub credentials?** → Login with a web browser
- It shows you an 8-character code like `ABCD-1234`. **Copy it**, then press Enter — a browser opens.
- Paste the code into the browser page, click through the prompts, authorize the CLI.
- Come back to PowerShell — it should now say "Logged in as [your username]".

If you don't have a GitHub account yet, the browser flow will let you sign up first. Use your real email.

Now create the private repo and push the code up:

```powershell
gh repo create acai-stock --private --source=. --push
```

This should print something like `https://github.com/YOUR-USERNAME/acai-stock`. That's the URL of your private code repository. Only you can see it.

If it says the name is taken, use a different one:
```powershell
gh repo create acai-stock-app --private --source=. --push
```

---

## Step 4 — Deploy to Vercel (~5 min)

Still in PowerShell, still in the `acai-stock` folder.

```powershell
vercel login
```

Same as GitHub — pick "Continue with GitHub" (or your preferred method), browser opens, authorize, come back to PowerShell.

Link this folder to a new Vercel project:

```powershell
vercel link
```

Answer the prompts:
- **Set up?** → Y
- **Which scope?** → your own account (usually only one option — press Enter)
- **Link to existing project?** → N
- **Project name?** → press Enter to accept `acai-stock`
- **Directory?** → press Enter to accept `.`
- Wait for "✅ Linked to..."

Now add the two secret values from Step 2:

```powershell
vercel env add NEXT_PUBLIC_SUPABASE_URL production
```
- It asks for the value. Paste the Project URL you saved (the `https://abcdefgh.supabase.co` one). Press Enter.

```powershell
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```
- Paste the long anon key (the `eyJ...` one). Press Enter.

Now deploy:

```powershell
vercel --prod
```

Wait ~30 seconds. It'll print a URL at the bottom like `https://acai-stock-abc123.vercel.app`. **That's your live app.** Copy it.

---

## Step 5 — Test it (~2 min)

1. Open the Vercel URL on your **phone** (message it to yourself or scan a QR of the URL).
2. Log in with the admin email + password you set in step 2.10.
3. You should land in the admin panel. Success.
4. To install as an app on your phone: in Safari (iPhone) tap the Share button → **Add to Home Screen**. In Chrome (Android) tap the ⋮ menu → **Install app**.

---

## When something breaks

**Vercel deploy fails with "Missing env vars"** — you skipped one of the `vercel env add` lines. Rerun them (both), then `vercel --prod` again.

**App loads but you can't log in** — Supabase Auth "Confirm email" is still ON (step 2.8). Fix it, try again.

**App loads, login works, but nothing appears** — you skipped step 2.11 (the SQL to mark yourself admin), or you pasted the wrong UUID. Redo step 2.11 with the correct UUID.

**Something else** — screenshot the error, come back to Claude and paste the screenshot in. I'll debug from there.

---

## After it's live

The DEPLOY_STATUS.md next to this file has the same steps in more compact form for reference. You can delete the scratch files on your Desktop that start with `_acai_` — they were only used to prep the repo.

To add more stores: see README.md → "Criar o login partilhado de cada loja".
