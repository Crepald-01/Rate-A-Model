# Rate the Models

Static site (GitHub Pages) + Supabase for accounts and ratings.
GitHub Pages can't run a server, so the Node backend was replaced with Supabase (free tier is enough).

## 1. Supabase (5 minutes)
1. Create a project at https://supabase.com.
2. **SQL Editor** → paste [`supabase/schema.sql`](supabase/schema.sql) → Run.
3. **Project Settings → API**: copy the Project URL and the `anon` public key into [`config.js`](config.js).
4. **Authentication → Providers → Email**: on by default. Turn off "Confirm email" if you want instant sign-up.
5. **Google sign-in**: create an OAuth client at https://console.cloud.google.com/apis/credentials (Web application).
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
   - Put the client ID and secret in **Authentication → Providers → Google** and enable it.
6. **Authentication → URL Configuration**: set Site URL to your Pages URL (`https://<user>.github.io/<repo>/`) and add it under Redirect URLs (also add `http://localhost:8000/` for local testing).

## 2. Deploy to GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<user>.github.io/<repo>/`.

## Local preview
```
python -m http.server 8000
```
then open http://localhost:8000.

## Editing models
Edit [`models.json`](models.json) and push. Ratings are keyed by each model's `id`, so keep ids stable.
