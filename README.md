# HttpClient

HttpClient is a browser-based REST API client built as a multi-package repo with:

- `frontend/`: React + TypeScript + Vite + Tailwind
- `backend/`: Fastify + MongoDB + JWT cookie auth
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

The root install bootstraps `shared/`, `backend/`, and `frontend/` automatically, so it works even on npm versions that do not support the `workspace:*` protocol.

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

## Production build

- `npm run build`
- `npm --prefix backend run start`

## Local database helpers

- `npm run db:up`
- `npm run db:down`
- `npm run db:remove` removes the MongoDB container and its Docker volume
- `npm run db:logs`
- `npm run db:backup`
