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
