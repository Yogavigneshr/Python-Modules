# LeadFinder
Two independent apps, run side by side:

- `backend/` — Django + DRF API. All external API calls (Google Places) and
  business logic live here in Python — see `leads/places_service.py` and
  `leads/views.py`. Auth is JWT-based (`accounts` app).
- `frontend/` — plain Vite + React SPA. No TanStack Router/Query/Start, no
  SSR, no Lovable tooling. See `frontend/README.md` for the structure.

## 1. Run the backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# then edit .env: set GOOGLE_PLACES_API_KEY, and DB_* if not using the defaults

# Create the DB + role first, e.g.:
#   createuser leadfinder -P
#   createdb leadfinder -O leadfinder

python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/

python manage.py runserver 0.0.0.0:8000
```

Backend is now live at http://localhost:8000/api

## 2. Run the frontend

```bash
cd frontend
npm install
cp .env.example .env   # already points VITE_API_BASE_URL at localhost:8000/api
npm run dev
```

Frontend is now live at http://localhost:5173 and calls the Django backend
for auth and search. `npm run build` produces a static `dist/` you can
serve from anywhere (nginx, S3+CDN, etc.) — no Node server required at
runtime.

## What changed in this pass

**Backend** — already a clean Django/DRF project from an earlier
conversion (Supabase → Django); left as-is:
- `leads/places_service.py` — pure-Python Google Places client + filtering/
  scoring logic, framework-free so it's easy to unit test.
- `leads/views.py` — DRF views wrapping that service (search caching,
  persistence, history).
- `accounts/` — JWT auth (register/login/refresh/logout/me).

**Frontend** — rewritten from a TanStack Start + Lovable scaffold into a
plain React SPA:
- Removed: `.lovable/`, `.tanstack/`, `@tanstack/react-router`,
  `@tanstack/react-query`, `@tanstack/react-start`, `@tanstack/router-plugin`,
  `@lovable.dev/vite-tanstack-config`, `nitro`, `src/server.js`,
  `src/start.js`, `src/router.jsx`, `src/routes/*`, and the SSR-only error
  reporting/capture helpers.
- Added: a plain `index.html` + `src/main.jsx` entry, a ~70-line
  dependency-free client-side router (`src/router/Router.jsx`), a minimal
  `useMutation` replacement, and a `pages/` + `context/` structure. See
  `frontend/README.md` for the full layout.
- Everything else (UI components, Tailwind theme, forms, the Django API
  client) is unchanged in behavior — only the app shell and routing moved.

⚠️ **Note:** `.env` files here only contain placeholders. If a real Google
Places API key or Supabase credential ever ended up in this project,
rotate it in the relevant console before deploying.
