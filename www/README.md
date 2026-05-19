# Web UI (www)

This folder contains a minimal Vite + React + TypeScript starter configured with Tailwind CSS. It is prepared as a base for integrating shadcn-style components.

Quick start

1. Change into the folder and install dependencies:

```bash
cd www
npm install
```

2. Initialize Tailwind (if not already installed via the template):

```bash
npx tailwindcss -i ./src/index.css -o ./dist/output.css --minify
```

3. (Optional) Use the `shadcn/ui` CLI to add components. Example:

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button
```

4. Run the dev server:

```bash
npm run dev
```

Notes
- This scaffold does not run installs automatically. Run `npm install` inside `www`.
- `shadcn-ui` is a component generation workflow that requires Node. Use `npx shadcn-ui` to bootstrap component files into `src/components`.

Flow Editor

This scaffold includes a visual Flow Editor (n8n-like) at the app root. It uses `react-flow-renderer` and includes a sample flow plus simple Save/Load persistence.

- Save/Load: uses `localStorage` under the key `savedFlow`. The editor also attempts to POST saved flows to `POST /flows/save` and will call `GET /flows/load` when loading if the API is available.
- API endpoints (backend stubs): `POST /flows/save` and `GET /flows/load` are implemented in the project's FastAPI server to persist flows to `data/flows.json`.

To run the UI:

```bash
cd www
npm install
npm run dev
```

To run the backend API (optional, enables plugin listing and server-side save/load):

```bash
python -m api.server
# or run via uvicorn
uvicorn api.server:app --reload --port 8000
```

Docker (recommended for easy setup)

Build and run with Docker Compose (this will start Redis, API, worker, and the web dev server):

```bash
docker compose up --build
```

- API will be available at http://localhost:8000
- Web dev server will be available at http://localhost:5173


