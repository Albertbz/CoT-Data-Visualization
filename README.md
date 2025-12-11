# CoT Data Visualization

Interactive visualizations for Chronicles of Time (characters, houses, and timelines).

This repository contains the data-processing code, the collected/merged JSON data, and
a small TypeScript + D3 frontend served from the `site/` directory.

---

## Prerequisites

- Node.js (16+ recommended) and `npm`.
- A working TypeScript toolchain (project includes `typescript` and `ts-node` dev deps).
- Optional but required for Google Sheets access: `credentials.json` and/or
	`service-account-key.json` in the project root (used by the data processing scripts).

Install dependencies:

```bash
npm install
```

---

## Quick run: Frontend (site)

Development server (Vite):

```bash
npm run dev:site
```

Open the URL shown by Vite (commonly http://localhost:5173). The frontend source lives in
`site/` and includes the TypeScript modules that build the visualizations.

Build a production site bundle:

```bash
npm run build:site
npm run preview:site
```

Notes:
- `site/index.html` is the page entrypoint.
- `site/src` contains the TypeScript modules used by the visualizations (e.g. `lifespan.ts`,
	`overview.ts`, `comparison.ts`, `data.ts`, `shared.ts`).

If you prefer to run the server-side bundle (if built), there's also:

```bash
npm run build   # compile TypeScript into `dist/`
npm run start   # runs `node dist/main.js` (if your workflow writes a server into dist/)
```

---

## Data processing (generate JSON data)

The `data_processing/` directory contains TypeScript utilities and a `main.ts` that
handles fetching/merging/parsing raw inputs (Google Sheets, local files, etc.) and
writing normalized output used by the site.

Run the processor in development (requires `ts-node`):

```bash
npx ts-node ./data_processing/main.ts
```

Or compile the project and run the compiled script (if `tsconfig.json` is set to emit into `dist/`):

```bash
npm run build
node dist/data_processing/main.js
```

Output locations (default):
- `merged_data/` — raw merged JSON files produced during processing.
- `parsed_data/` — normalized/parsed output intended for consumption by the frontend.

Notes about credentials:
- If the data processor accesses Google Sheets or Google APIs it will expect either
	`credentials.json` (OAuth client credentials) or `service-account-key.json` (service account)
	in the project root. Keep these files secure and do not commit them to source control.

---

## Project layout (important files & folders)

- `data_processing/` — TypeScript data ingestion & processing scripts.
	- `main.ts` — entrypoint for processing.
	- `auth.ts`, `drive.ts`, `sheets.ts`, `filemanagement.ts`, `dataprocessing.ts`, `utils.ts` — helpers.
- `merged_data/` — automatically produced merged JSON snapshots (raw outputs).
- `parsed_data/` — processed JSON the frontend expects.
- `site/` — frontend app (Vite-ready)
	- `site/index.html` — single-page entrypoint
	- `site/styles.css` — global styles
	- `site/src/` — TypeScript source for the visualizations
		- `data.ts` — data adapter (game-month mapping, lists and processedCharacterData)
		- `lifespan.ts` — lifespan Gantt visualization and controls
		- `overview.ts`, `comparison.ts` — other charts
		- `shared.ts` — color maps and shared helpers
		- `main.ts` — site module bootstrapping
- `credentials.json`, `service-account-key.json` — optional Google API credentials (kept out of VCS)
- `package.json`, `tsconfig.json` — project build and scripts

---

## Developer commands & tips

- Install dependencies:

	```bash
	npm install
	```

- Run the frontend dev server (fast edit/reload):

	```bash
	npm run dev:site
	# open http://localhost:5173
	```

- Build the TypeScript (project-wide):

	```bash
	npm run build
	```

- Run the compiled Node entry (if used for server-side tasks):

	```bash
	npm run start
	```

- Lint and fix:

	```bash
	npm run lint
	npm run lint:fix
	```

Common troubleshooting
- If the data scripts fail with authentication errors, ensure your `credentials.json`
	or `service-account-key.json` are present and contain valid Google API credentials.
- If the site does not reflect code changes, ensure the Vite dev server is running and
	that you opened the Vite-served URL (not the raw `file://` page).

---

## Quick verification

- After the site loads check the browser console for the log `Visualization initialized.`
	which confirms `site/src/main.ts` ran.
- `data.ts` logs its preparation (affiliations/dates/characters) to the console as well.
