# Dalaly

Dalaly is a local desktop app for managing real-estate offers for an Iraqi brokerage office. It runs with Electron, Vue 3, Vuetify, a local Fastify API, and PostgreSQL.

## Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL running locally
- Optional: `tools/cloudflared/cloudflared.exe` for remote access

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a local PostgreSQL database:

   ```sql
   CREATE DATABASE dalaly;
   ```

3. Copy `.env.example` to `.env` and set the database credentials.
4. Run the migration manually if you want to validate the database before opening the app. The API also runs Drizzle migrations automatically on startup.

   ```bash

   ```

pnpm db:migrate

````

5. Start the app in development:

   ```bash
   pnpm dev
````

The Electron app starts the Fastify API on `127.0.0.1:45678` and loads the Vue/Vuetify renderer from Vite. On first startup the app validates PostgreSQL connectivity and shows a setup/login screen.

Default first-install administrator values come from `.env`:

```text
ADMIN_USERNAME=admin
ADMIN_PIN=1234
```

Change these before first run for customer machines.

## Production Build

```bash
pnpm build
pnpm start
```

## Distribution Builds

```bash
pnpm package          # portable + installer targets
pnpm package:portable # Windows portable exe
pnpm package:installer # Windows NSIS installer
pnpm release          # full release build into apps/desktop/release
```

## Remote Access

Remote access is optional. Place `cloudflared.exe` at:

```text
tools/cloudflared/cloudflared.exe
```

The core app works normally when this file is missing. The remote-access page will show a clear unavailable message.
