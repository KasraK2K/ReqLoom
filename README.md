# HttpClient

HttpClient is a browser-based REST API client built as a multi-package repo with:

- `frontend/`: React + TypeScript + Vite + Tailwind
- `backend/`: Fastify + MongoDB + JWT cookie auth
- `desktop/`: Electron wrapper that opens a deployed HttpClient domain
- `shared/`: shared TypeScript contracts used by both apps

## Local development

1. Install dependencies with `npm install`
2. Copy `.env.example` to `backend/.env` or the repo root `.env` if you want to override defaults
3. Start MongoDB with `npm run db:up`
4. Run `npm run dev`
5. Open the local Vite URL shown in the terminal, usually `http://127.0.0.1:3030`

The backend defaults to a local MongoDB database and secure cookie session, and `compose.yaml` starts MongoDB on the expected local port so the app can boot without extra setup. Backups are written into `./backup` by running `npm run db:backup` when the MongoDB container is up.

The frontend dev server uses `127.0.0.1` and starts at port `3030` because some Windows setups reserve port `5173`, which causes Vite to fail with `EACCES`. If `3030` is busy, Vite will automatically move to the next available local port.

The backend now defaults to port `3500` and the frontend proxy reads the same `BACKEND_PORT` value from the shared env file. In development, a legacy `PORT=4000` setting is also remapped to `3500` so older local env files do not keep hitting the Windows `EACCES` socket restriction on port `4000`.

The root install bootstraps `shared/`, `backend/`, `frontend/`, and `desktop/` automatically, so it works even on npm versions that do not support the `workspace:*` protocol.

## Desktop Apps

Build a desktop app that connects to your deployed server domain with:

- `npm run desktop:build`
- `npm run desktop:build:win`
- `npm run desktop:build:linux`
- `npm run desktop:build:mac`

Each command asks for the domain to open, like `https://api.example.com`, then packages a desktop shell into `desktop/dist`.

You can also skip the prompt and pass the domain directly:

- `npm run desktop:build -- --domain=https://api.example.com`

Platform notes:

- `desktop:build` targets the current operating system automatically
- Windows builds work best on Windows
- Linux builds work best on Linux
- macOS builds usually need to run on macOS

## Docker stack

Run the full application with:

- `npm run docker:up`

Open the app at `http://localhost:3500`. The backend serves the built frontend from the same container, MongoDB runs in Docker, and backups can be written into `./backup` with:

- `npm run db:backup`

Useful Docker commands:

- `npm run docker:logs`
- `npm run docker:down`
- `npm run docker:remove`

Optional Docker env overrides from `.env`:

- `APP_PORT` changes the published app port
- `MONGODB_PORT` changes the published MongoDB port
- `DOCKER_FRONTEND_ORIGIN` overrides the browser origin allowed by the production container
- `DOCKER_MONGODB_BACKUP_URI` overrides the MongoDB URI used by `mongodump` inside the container

## Nginx on a server

If you want to put the Docker app behind Nginx on a server, start with the sample file at `./nginx.httpclient.conf.sample`, replace `<domain>`, then move it into `/etc/nginx/sites-available/`, link it into `/etc/nginx/sites-enabled/`, and let Certbot add the TLS section.

The sample is written so:

- `https://<domain>/` serves the frontend
- `https://<domain>/api/...` reaches the backend API

Recommended `.env` values for a single-domain HTTPS deploy:

```env
APP_PORT=3500
DOCKER_FRONTEND_ORIGIN=https://<domain>
COOKIE_SECURE=true
COOKIE_DOMAIN=
```

Leave `COOKIE_DOMAIN` empty if the app will only be served from one host name. Set it to your domain only if you specifically need a wider cookie scope.

In the current Docker setup, both Nginx locations still proxy to `127.0.0.1:3500` because the app container serves the built frontend and the `/api/*` routes from the same process. The path split is still useful because it matches how the frontend already calls the API with `/api`.

## Production build

- `npm run build`
- `npm --prefix backend run start`

## Local database helpers

- `npm run db:up`
- `npm run db:down`
- `npm run db:remove` removes the MongoDB container and its Docker volume
- `npm run db:logs`
- `npm run db:backup`
