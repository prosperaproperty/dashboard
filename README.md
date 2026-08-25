Property Dashboard

This repository contains a simple property dashboard with a static frontend and an Express + SQLite backend.

Quickstart

1. Install dependencies (project root):

   npm install

2. Run backend (development):

   cd backend
   npm install
   npm start

3. Run tests (from project root):

   npm test

Notes for contributors

- Tests run the backend in-process and use an in-memory SQLite database when NODE_ENV=test, so they are fast and isolated.
- If you need to reset the database when running locally, remove or rename backend/property_dashboard.db.
- A Git patch of the initial test changes is available at backend-tests.patch.

CI

A GitHub Actions workflow is included at .github/workflows/ci.yml which runs `npm test` on push and pull requests to main/master.

Commit instructions (if git is available locally)

From project root:

  git add -A
  git commit -m "Add backend tests (Jest + Supertest): health and CRUD tests\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
