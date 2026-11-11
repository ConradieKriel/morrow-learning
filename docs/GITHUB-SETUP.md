# Push Morrow to GitHub safely

This guide assumes you have extracted the `Morrow-Learning` folder from the ZIP. Open that exact folder in Visual Studio Code. It should contain `package.json`, `app/`, `lib/`, `supabase/`, `.gitignore` and this README.

## 1. Check the files before GitHub

1. Open the `Morrow-Learning` folder in VS Code.
2. Open the terminal in VS Code (**Terminal → New Terminal**).
3. Run `npm install`. This installs the packages and creates `package-lock.json`. Keep and commit that lock file; the GitHub Actions workflow uses `npm ci`, which requires it. Do not create a fake lock file by hand.
4. Confirm the `.gitignore` file is in the project root.
5. Your local `.env.local` file is allowed to stay in this folder. Git ignores it. Do not rename it to `.env.example` and do not copy its real values into the example file.

Check that Git ignores the local environment file:

```bash
git check-ignore -v .env.local
```

It should print a matching `.gitignore` rule. If it prints nothing, stop and fix `.gitignore` before staging files.

## 2. Create a private GitHub repository

1. Sign in at [GitHub](https://github.com/).
2. Click **New repository**.
3. Name it `morrow-learning`.
4. Set visibility to **Private** while this is coursework and before you have reviewed every file for secrets.
5. Do not initialise it with a README, `.gitignore` or licence because those files already exist in this project.
6. Create the repository and leave its page open.

## 3. Review exactly what you are about to upload

In the VS Code terminal, make sure you are inside `Morrow-Learning`, then run:

```bash
git init -b main
git add .
git status --short
```

Read the complete list. Normal source files, docs, SQL migrations, tests, `.github/`, `.gitignore`, the placeholder-only `.env.example` and `package-lock.json` are okay. SQL schema and migration files are source code, not database backups.

**Stop and do not commit** if you see any of these:

- `.env.local`, `.env`, `.env.production`, `.env.*.local`, `.npmrc`, or any real environment file.
- A Gemini API key, Supabase secret/service-role key, database password, access token, private key or credential JSON.
- `node_modules/`, `.next/`, `.vercel/`, or personal backups.

The `.env.example` file is safe only because it contains placeholders. Never paste real keys into it. If you see a filename you do not recognise, do not push it until you understand what it contains.

You can double-check staged files with:

```bash
git diff --cached --name-only
git diff --cached
```

If `.env.local` was ever tracked in Git before, `.gitignore` cannot untrack it automatically. Run `git rm --cached .env.local`, then rotate every key/password that was inside it. Removing a secret in a later commit does not remove it from Git history.

## 4. Commit and push

Replace `YOUR-GITHUB-USERNAME` with your GitHub username and use the HTTPS repository URL shown on GitHub:

```bash
git commit -m "Initial Morrow Learning project"
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/morrow-learning.git
git push -u origin main
```

GitHub may open a browser window to authenticate. Do not put a password or personal access token inside the remote URL.

## 5. Protect the repository

On GitHub, open **Settings**:

1. Keep the repository private unless your group has a reason to make it public.
2. Under **Code security and analysis**, enable secret scanning and push protection if your plan offers them.
3. Under **Branches**, add a rule for `main`. Require pull requests and require the **Morrow checks** workflow to pass before merging. Disallow force pushes.
4. Keep the `.github/dependabot.yml` file. It asks GitHub to offer dependency and GitHub Actions updates each week.

The CI workflow checks dependencies, runs the tests, lint, TypeScript and production build. It does not need your Supabase or Gemini secrets. If CI fails at `npm ci`, check that `package-lock.json` was committed after running `npm install`.

## 6. Updating the app later

After editing Morrow, review the changed files before pushing:

```bash
git status --short
git diff
git add app lib components supabase docs .github README.md SECURITY.md package.json package-lock.json next.config.ts .gitignore
git diff --cached
git commit -m "Describe the change"
git push
```

Do not blindly run `git add .` if you have downloaded backups, screenshots, exports or files containing credentials into the project folder. Review `git status` first.

## Files that must never be pushed

| File/folder | Why |
|---|---|
| `.env.local`, `.env`, `.env.production` | Contains real project secrets or local settings |
| `node_modules/` | Installed dependencies, recreated by npm |
| `.next/`, `out/`, `build/` | Generated build output |
| `.vercel/` | Local Vercel project state and metadata |
| `*.pem`, `*.key`, `*.p12`, `*.pfx` | Private key/certificate material |
| `credentials.json`, `secrets/`, `.npmrc` | Potential account or package-manager credentials |
| `*.sql.gz`, `*.dump`, `*.bak` | Local database exports or backups that may contain user data |

`package-lock.json` should be pushed. `.env.example` should be pushed only with placeholder values.
