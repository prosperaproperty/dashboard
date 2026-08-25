# Property Dashboard

A small property management dashboard with a static frontend and an Express + SQLite backend. It lets you create, view, search, filter, edit, and delete property records.

## Features

- Add new property records
- View total portfolio value and average pricing
- Search properties by name, code, or type
- Filter by property type
- Edit existing property entries
- Delete records safely
- REST API with SQLite storage

## Project structure

- `index.html` — frontend UI
- `style.css` — dashboard styling
- `backend/server.js` — Express API entry point
- `backend/db.js` — database initialization and schema
- `backend/routes/properties.js` — property API endpoints
- `.github/workflows/ci.yml` — CI workflow for tests
- `.github/workflows/copilot-setup-steps.yml` — GitHub Copilot setup workflow

## Requirements

- Node.js 18+
- npm

## Local development

1. Install the root dependencies:

   npm install

2. Install backend dependencies:

   cd backend
   npm install
   cd ..

3. Start the API server:

   cd backend
   npm start

4. In a second terminal, serve the frontend:

   cd ..
   npx serve -l 3000 .

5. Open the app in a browser:

   http://localhost:3000

## API

Backend runs on:

- http://localhost:3001

Available routes:

- `GET /` — health check
- `GET /api/properties` — list properties
- `GET /api/properties/:id` — fetch one property
- `POST /api/properties` — create a property
- `PUT /api/properties/:id` — update a property
- `DELETE /api/properties/:id` — delete a property

## Testing

Run the backend test suite from the project root:

npm test

The tests use an in-memory SQLite database when `NODE_ENV=test`, so they are fast and isolated.

## GitHub Actions

This repo includes workflows for:

- CI (`.github/workflows/ci.yml`) — runs tests on push and pull requests
- Copilot setup (`.github/workflows/copilot-setup-steps.yml`) — configures Copilot environment

## Deployment notes

- The frontend is static and can be deployed to a static hosting service such as GitHub Pages, Vercel static hosting, Netlify, or any web server serving the root files.
- The backend is a Node.js server and must be hosted separately (for example: Railway, Render, Fly.io, VPS, or a Node-capable hosting platform).
- For local development, the frontend expects the API at `http://localhost:3001/api/properties`.
- A ready-to-use Render configuration is included at `render.yaml` for a Node web service.

## Deploy the API to Render

1. Sign in to Render and create a new Web Service.
2. Connect the GitHub repository `prosperaproperty/dashboard`.
3. Use the default settings from `render.yaml`.
4. Render will run:
   - `cd backend && npm install`
   - `cd backend && npm start`
5. After deployment, copy the live API URL and set it in the frontend as the `window.PROPERTY_API_BASE` value, or update the built frontend if you are wiring to a production API.

Example production API base:

```js
window.PROPERTY_API_BASE = 'https://your-render-service.onrender.com/api/properties';
```

## Resetting local data

If you need to reset the local SQLite database:

- remove or rename `backend/property_dashboard.db`

## Git status

The repository is set to use SSH for GitHub:

- `git@github.com:prosperaproperty/dashboard.git`

Once the corresponding SSH key is added to your GitHub account, the repo can be pushed with:

git push -u origin main
