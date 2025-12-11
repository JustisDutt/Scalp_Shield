<p align="center">
  <img src="frontend/public/scalpshield-logo.png" alt="ScalpShield logo" width="160" />
</p>

# ScalpShield (XGBoost)

Local demo SaaS for detecting suspicious ticket purchases using a pre trained XGBoost model.

All login, subscription, and payment flows are fully simulated. No real authentication or billing occurs.

ScalpShield is a local only demo that analyzes CSV ticket purchase data with a binary XGBoost model and renders the results in a SaaS style dashboard. The app includes a fake login screen, fake subscription upgrade, and fake credit card checkout, but only runs on your machine and does not talk to external services.

This project is meant to look and feel like a real production style ML product: backend API, trained model, and a modern dashboard.

ScalpShield is licensed under the MIT License. See the [License](#license) section for details.

---

## Table of contents

- [Features](#features)
  - [Product experience](#product-experience)
  - [ML backend](#ml-backend)
  - [Analytics dashboard](#analytics-dashboard)
- [Architecture](#architecture)
- [Folder structure](#folder-structure)
- [Data model and CSV schema](#data-model-and-csv-schema)
  - [Required columns](#required-columns)
  - [Optional columns](#optional-columns)
- [XGBoost model](#xgboost-model)
- [Backend setup](#backend-setup)
  - [Prerequisites](#prerequisites)
  - [Create and activate virtual environment](#create-and-activate-virtual-environment)
  - [Install dependencies](#install-dependencies)
  - [Train the XGBoost model](#train-the-xgboost-model)
  - [Start the FastAPI server](#start-the-fastapi-server)
- [Frontend setup](#frontend-setup)
  - [Prerequisites](#frontend-prerequisites)
  - [Install dependencies](#install-frontend-dependencies)
  - [Configure API base URL](#configure-api-base-url)
  - [Start the dev server](#start-the-dev-server)
- [Running the full app](#running-the-full-app)
- [Using the UI](#using-the-ui)
  - [Login](#login)
  - [Upload data and run the model](#upload-data-and-run-the-model)
  - [Upgrade to Pro simulated](#upgrade-to-pro-simulated)
- [API reference](#api-reference)
  - [POST /api/predict](#post-apipredict)
- [Environment configuration](#environment-configuration)
  - [Frontend](#environment-frontend)
  - [Backend](#environment-backend)
- [Development workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Security and privacy](#security-and-privacy)
- [Future work](#future-work)
- [License](#license)

---

## Features

### Product experience

- Fake login screen that accepts any email and password.
- Fake Pro subscription upgrade and credit card checkout UI.
- Session state stored in `localStorage` for login and subscription tier.
- Free vs Pro feature gating.
- Dark mode toggle.

### ML backend

- FastAPI service written in Python.
- Pre trained XGBoost binary classifier saved as `model_xgb.json`.
- Inference only at runtime (no retraining per upload).
- CSV schema validation with clear `400` errors if columns are missing.
- Risk probability per row in `[0, 1]`.
- Traffic light flags per row: `green`, `yellow`, `red`.
- Rule based explanation text for each prediction.

### Analytics dashboard

- Risk summary cards (total, green, yellow, red).
- Suspicion probability histogram.
- Top suspicious users bar chart.
- Hour by weekday activity heatmap (Pro tier only).
- Scrollable table of all scored purchases.
- Row detail drawer with explanations and raw fields.

---

## Architecture

ScalpShield runs as two local services:

**Backend (Python, FastAPI)**

- Loads a pre trained XGBoost model from `model_xgb.json`.
- Exposes `POST /api/predict`.
- Accepts CSV uploads and returns JSON with scores and summary.

**Frontend (Next.js, React, TypeScript)**

- Renders login, upload, dashboard, charts, and tables.
- Sends CSV to the backend and consumes prediction JSON.
- Handles fake login and subscription state in `localStorage`.

---

## Folder structure

```text
repo-root/
  README.md
  sample_data.csv

  backend/
    requirements.txt
    app/
      __init__.py
      main.py
      schemas.py
      explanations.py
      train_xgb.py
      model_xgb.json  # created after training

  frontend/
    package.json
    tsconfig.json
    next-env.d.ts
    next.config.js
    tailwind.config.cjs
    postcss.config.cjs
    src/
      pages/
        _app.tsx
        index.tsx
      lib/
        api.ts
      styles/
        globals.css
```

### Backend

- `backend/app/main.py` - FastAPI application and `/api/predict` endpoint.
- `backend/app/train_xgb.py` - Synthetic data generator and XGBoost training script.
- `backend/app/model_xgb.json` - Saved XGBoost model used at inference time.

### Frontend

- `frontend/src/pages/index.tsx` - Main dashboard: login, upload, charts, table, detail drawer, fake checkout.
- `frontend/src/lib/api.ts` - Typed client for calling the `/api/predict` endpoint.

---

## Data model and CSV schema

Each CSV row represents one ticket purchase.

### Required columns

These features are used directly by the XGBoost model and must be present:

- `minutes_since_release`  
  Minutes between ticket release time and this purchase.
- `tickets`  
  Number of tickets in this single purchase.
- `total_amount`  
  Total spend for this purchase (for example `180.0`).
- `ip_purchase_count_24h`  
  Number of purchases from this IP address in the last 24 hours.
- `user_purchase_count_30d`  
  Number of purchases by this user in the last 30 days.
- `user_account_age_days`  
  Age of the user account in days.
- `same_card_purchase_count_24h`  
  Number of purchases on this payment card in the last 24 hours.

If any required column is missing, the API responds with `HTTP 400` and an error like:

```json
{
  "detail": "Missing required columns: user_account_age_days, same_card_purchase_count_24h"
}
```

### Optional columns

These are not required by the model but are used for charts, labeling, and explanations:

- `timestamp`
- `transaction_id`
- `user_id`
- `event_id`
- `device_info`

The included `sample_data.csv` shows a minimal valid file.

---

## XGBoost model

The model is trained once on synthetic ticket data created by `train_xgb.py`, then saved to `model_xgb.json`.

High level flow in `train_xgb.py`:

1. Generate synthetic users, events, and purchases with a mix of normal and scalper-like behavior.
2. Build feature vectors from the seven required numeric columns.
3. Train a binary XGBoost classifier.
4. Save the trained model to `backend/app/model_xgb.json`.

At inference time the backend:

1. Loads `model_xgb.json` into an `xgboost.Booster` during startup.
2. Parses the uploaded CSV into a Pandas `DataFrame`.
3. Validates and coerces the required numeric columns.
4. Builds a feature matrix for XGBoost.
5. Calls `Booster.predict` to get probabilities in `[0, 1]`.
6. Maps each probability to a risk flag.
7. Builds explanation strings using simple rules in `explanations.py`.

### Probability thresholds and flags

Current mapping from probability to flag:

- `green` for probability `< 0.35`
- `yellow` for `0.35 <= probability < 0.80`
- `red` for probability `>= 0.80`

The thresholds are chosen so that typical synthetic data has:

- Mostly green rows.
- A visible band of yellow rows (borderline).
- A smaller segment of red rows (highly suspicious).

### Explanation engine

The backend inspects each scored row and appends short explanations such as:

- High ticket volume in one purchase.
- High total spend.
- Many purchases from the same IP in 24 hours.
- Very new or relatively new user account.
- Many purchases on the same card in 24 hours.
- Suspicious device string such as `headless`, `python-requests`, `curl`, `selenium`.

If no specific rules fire, it returns a generic explanation based on probability and always ends with a line like:

> Model probability of suspicious activity: 0.76.

---

## Backend setup

### Prerequisites

- Python 3.10 or later.
- `pip` on your path.

From the repo root:

```bash
cd backend
python -m venv .venv
```

### Create and activate virtual environment

Windows PowerShell:

```bash
.venv\Scripts\activate
```

macOS or Linux:

```bash
source .venv/bin/activate
```

You should see `(.venv)` at the start of your prompt.

### Install dependencies

```bash
pip install -r requirements.txt
```

This installs FastAPI, Uvicorn, Pandas, NumPy, XGBoost, and related packages.

### Train the XGBoost model

Run this once to create or refresh `model_xgb.json`:

```bash
python app/train_xgb.py
```

You should see logs similar to:

```text
Building synthetic dataset...
Training XGBoost model...
Saved model to .../backend/app/model_xgb.json
```

### Start the FastAPI server

With the virtual environment still active:

```bash
uvicorn app.main:app --reload --port 8000
```

The backend will be available at:

- API root: <http://localhost:8000/>
- Docs: <http://localhost:8000/docs>

---

## Frontend setup

### Frontend prerequisites

- Node.js 18 or later.
- `npm` or `yarn` (examples below use `npm`).

From the repo root:

```bash
cd frontend
npm install
```

This installs Next.js, React, TypeScript, Tailwind, Recharts, and dev tooling.

### Configure API base URL

The frontend reads the backend URL from `NEXT_PUBLIC_API_BASE_URL`. If that variable is not set, it defaults to `http://localhost:8000`.

To be explicit, create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Restart `npm run dev` after editing environment variables.

### Start the dev server

```bash
npm run dev
```

The frontend is served at:

- <http://localhost:3000>

---

## Running the full app

From a clean clone:

### Backend

```bash
cd backend
python -m venv .venv
# activate the venv
pip install -r requirements.txt
python app/train_xgb.py
uvicorn app.main:app --reload --port 8000
```

### Frontend in a second terminal

```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:3000> in your browser.

---

## Using the UI

### Login

Use any email and password, for example:

- Email: `demo@scalpshield.ai`
- Password: `password123`

The frontend sets `scalpshield_logged_in` in `localStorage`.

### Upload data and run the model

In the dashboard upload panel:

1. Choose a CSV file. You can start with `sample_data.csv` in the repo root.
2. Click **Run model**.

If the request succeeds, you see:

- Summary cards update.
- Histogram and Top users charts populate.
- Table of scored purchases.
- A detail drawer when you click a row.

If there is a schema error, you see a readable message in the risk summary card panel.

### Upgrade to Pro simulated

1. Click **Upgrade to Pro** in the header or heatmap section.
2. A fake checkout modal appears.
3. Enter any card information (no real payment is processed).
4. On submit, the app sets `scalpshield_subscription` to `pro` in `localStorage`.
5. The hour by weekday heatmap unlocks for that browser.

---

## API reference

### POST /api/predict

Upload a CSV file and get scored predictions.

**URL**

```text
POST http://localhost:8000/api/predict
```

**Request**

- Content type: `multipart/form-data`
- Field:
  - `file`: the CSV file to score.

Example:

```bash
curl -X POST "http://localhost:8000/api/predict" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@sample_data.csv"
```

**Response 200**

```json
{
  "rows": [
    {
      "row_index": 0,
      "probability": 0.21,
      "flag": "green",
      "explanations": [
        "No strong risk indicators detected based on current variables.",
        "Model probability of suspicious activity: 0.21."
      ],
      "raw": {
        "transaction_id": "tx_0001",
        "user_id": "user_001",
        "event_id": "event_rockfest",
        "timestamp": "2025-03-01T19:32:00",
        "minutes_since_release": 10,
        "tickets": 2,
        "total_amount": 180.0,
        "ip_purchase_count_24h": 1,
        "user_purchase_count_30d": 2,
        "user_account_age_days": 120,
        "same_card_purchase_count_24h": 1,
        "device_info": "Chrome on Mac"
      },
      "transaction_id": "tx_0001",
      "user_id": "user_001",
      "event_id": "event_rockfest",
      "timestamp": "2025-03-01T19:32:00"
    }
  ],
  "summary": {
    "count_total": 5,
    "count_green": 3,
    "count_yellow": 1,
    "count_red": 1
  }
}
```

**Error responses**

- `400` with `{"detail": "Please upload a CSV file."}`
- `400` with a `Missing required columns` message if the CSV is missing required fields.
- `400` with `Could not read CSV: ...` if the CSV cannot be parsed.

---

## Environment configuration

### Environment frontend

- `NEXT_PUBLIC_API_BASE_URL`  
  Base URL for the backend API. Default is `http://localhost:8000`.

Example `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Environment backend

No environment variables are required in the current version. The port is controlled by the `uvicorn` command:

```bash
uvicorn app.main:app --reload --port 8000
```

If you change the port, update `NEXT_PUBLIC_API_BASE_URL` accordingly.

---

## Development workflow

Typical local workflow:

1. Edit backend code in `backend/app`.
2. If you change training or features, run `python app/train_xgb.py`.
3. Restart `uvicorn` as needed.
4. Edit frontend code in `frontend/src`.
5. Use `npm run dev` for hot reload.
6. Commit from the repo root with a `.gitignore` that excludes `.venv` and `node_modules`.

Common scripts:

**Backend**

```bash
cd backend
python app/train_xgb.py
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm run dev
npm run build
npm start
```

---

## Troubleshooting

### xgboost import error

If you see:

```text
ImportError: No module named 'xgboost'
```

Check:

- The virtual environment is active.
- You ran `pip install -r requirements.txt` in the `backend` folder.

### VS Code Pylance cannot resolve xgboost

- Set the VS Code Python interpreter to `backend/.venv`.
- Reload the window.

### Frontend cannot reach backend

If the UI shows **Failed to get predictions**:

- Confirm `uvicorn` is running.
- Confirm `NEXT_PUBLIC_API_BASE_URL` matches the backend URL.
- Check your browser dev tools Network tab for the exact error.

### All rows green or all rows red

This can happen if the data distribution is very different from the synthetic training data. You can:

- Adjust thresholds in the backend.
- Regenerate synthetic data in `train_xgb.py` to better match your real world distribution.
- Retrain the model and restart the backend.

---

## Security and privacy

This project is a local demo only.

- No database.
- No real user accounts.
- Login and subscription state are stored only in `localStorage`.
- The fake checkout does not talk to any payment provider.
- Uploaded CSV data is processed in memory by the FastAPI process.

If you adapt this for production, you must replace fake auth and billing with real secure services and add proper security hardening.

---

## Future work

Possible extensions:

- Train on real ticket purchase history instead of synthetic data.
- Add a database for events, thresholds, and audit logs.
- Add proper user accounts and role based access.
- Store model inputs and outputs for monitoring and drift detection.
- Add export of scored results to CSV or JSON.
- Add model versioning, rollback, and A/B tests.
- Containerize backend and frontend for deployment.

---

## License

ScalpShield is released under the MIT License.

Add this text to a `LICENSE` file in the repo root:

```text
MIT License

Copyright (c) 2025 Justis Dutt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files the "Software", to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, andor sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
