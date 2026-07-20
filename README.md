# HU Shopping Cart Helper — Fall 2026

Conflict-free Fall 2026 timetable builder for Habib University.

## Live site

https://0bionic.github.io/HU-Shopping-Cart-Helper-Fall-2026/

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Features

- Search and add Fall 2026 courses to a cart
- Generate ranked conflict-free schedule combinations
- Filter by day start/end and days off
- Weekly timetable with class numbers
- One-click **Copy Class Number** for enrollment

## Data

Course data is parsed from `Fall 2026 Schedule of Classes.pdf` into `public/courses.json`.

To re-parse after a PDF update (requires PyMuPDF on Python 3.10+):

```bash
python parse_schedule.py
```

## Deploy

Pushes to `main` build and publish via GitHub Pages (see `.github/workflows/deploy.yml`).
