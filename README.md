# API to Excel Chrome Extension

A modern Chrome Extension (Manifest V3) built with **Vite**, **TypeScript (`.ts` / `.tsx`)**, **React**, and **SheetJS (`xlsx`)**.

Intercepts network API requests, captures authenticated user sessions, runs auto-paginated background fetch loops, flattens JSON arrays, and exports data directly into Excel (`.xlsx`) or CSV files.

## 🚀 Key Features

- **Network API Interception**: Intercepts HTTP/JSON network requests in real-time via `chrome.webRequest`.
- **Session Authentication**: Inherits active Chrome login sessions automatically via `credentials: 'include'`.
- **Auto-Pagination Fetch Loop**: Fetches multi-page backend datasets (Pages 1–N) in background service worker.
- **json2csv JSON Flattener**: Auto-detects array paths, flattens nested objects, and supports field toggling.
- **Persistent Background Execution**: Tasks continue fetching in background even if popup is closed or clicked outside.
- **Real-Time API Search Bar**: Filter captured API endpoints by keyword.
- **Pure TypeScript**: 100% type-safe implementation.

## 🛠️ Build & Install

```bash
# Install dependencies
npm install

# Build extension for Chrome
npm run build
```

Load the compiled `dist/` folder into Google Chrome via `chrome://extensions/` (**Load unpacked**).
