# LeadFinder — frontend

Plain Vite + React SPA. No TanStack Router/Query/Start, no SSR, no Lovable
tooling — just React talking to the Django API in `../backend`.

## Structure

```
src/
  main.jsx              entry point (createRoot + <App />)
  App.jsx                providers + route table
  styles.css              Tailwind v4 theme
  router/Router.jsx       tiny dependency-free client-side router
                          (RouterProvider, Route, Link, Navigate,
                          useNavigate, usePath)
  context/AuthContext.jsx auth state, backed by the Django JWT endpoints
  pages/                  one component per screen
    LeadFinderPage.jsx
    LoginPage.jsx
    NotFoundPage.jsx
  hooks/
    use-mutation.js       minimal useMutation (pending/error/data)
    use-document-title.js sets document.title per page
    use-mobile.jsx
  components/
    ErrorBoundary.jsx
    ui/                   shadcn/radix component library (unchanged)
  lib/
    api-client.js          fetch wrapper + auth/leads API calls
    utils.js
```

## Routing

There are only two real screens, so this app uses a ~70-line custom router
(`src/router/Router.jsx`) built on the History API instead of a routing
library: `<RouterProvider>` tracks `window.location.pathname`, `<Route
path="...">` renders its children when the path matches, `<Link>` intercepts
clicks to `pushState` instead of a full page load, and `<Navigate to="...">`
performs a redirect from inside a component.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/, served by any static host
```

Configure the API origin in `.env` (see `.env.example`):

```
VITE_API_BASE_URL=http://localhost:8000/api
```
