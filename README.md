# Government Procurement Analytics Dashboard

A full-stack analytics dashboard tracking **120 KPIs** across the procurement lifecycle for the Maharashtra Public Health Department. Built on real procurement data (428 records from ABCD workbook covering ₹9,333 Cr portfolio).

![Stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20MongoDB%20%7C%20React-blue) ![License](https://img.shields.io/badge/license-GovUse-gold)

---

## Features

- **7 Dashboard Pages** — Executive Overview, Statement Analysis (A/B/C/D), PO & Payment Monitoring, Tender Pipeline, Backlog & Retender, Risk & Governance, Action Tracker
- **120 KPIs** across 10 groups (Executive, Statement, PO, Payment, Tender, Backlog, Risk, Category, Department, Governance)
- **7 User Roles** with RBAC + row-level security for Dept Heads
- **Alerts & Escalation Engine** — 4 threshold-based alerts, automatic 7d→L1/14d→L2/30d+Critical→L5 escalation, hourly cron
- **PDF + Excel export** with government letterhead and confidential watermark
- **Excel data upload** (drag-drop) with ETL pipeline
- **SMTP email** notifications with log-only fallback

---

## Quick Start — Docker (Recommended)

### Prerequisites
- Docker 20+ & Docker Compose v2

### Run
```bash
# From the project root
docker compose up --build
```

The app boots with MongoDB, seeds 7 users + 428 procurement records automatically.

- Frontend → http://localhost:3000
- Backend API → http://localhost:8001/api
- MongoDB → localhost:27017

### Stop
```bash
docker compose down          # keep data
docker compose down -v       # wipe MongoDB volume
```

---

## Quick Start — Manual (No Docker)

### Prerequisites
- Python 3.11+
- Node.js 18+ with Yarn
- MongoDB 6+ running locally

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env              # then edit SMTP / secrets as needed
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

On first boot the backend:
- Creates Mongo indexes
- Seeds the 7 demo users
- Loads `uploaded_data/abcd.xlsx` → **428 procurement records**
- Starts the hourly APScheduler jobs (KPI check + escalation)

### 2. Frontend

```bash
cd frontend
cp .env.example .env              # set REACT_APP_BACKEND_URL if needed
yarn install
yarn start
```

Open http://localhost:3000

---

## Login

All demo users share the pattern `{Role}@2026`:

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | admin@maha.gov.in | Admin@2026 |
| Secretary | secretary@maha.gov.in | Secretary@2026 |
| Minister | minister@maha.gov.in | Minister@2026 |
| Dept Head | depthead@maha.gov.in | DeptHead@2026 |
| Finance | finance@maha.gov.in | Finance@2026 |
| Audit | audit@maha.gov.in | Audit@2026 |
| Viewer | viewer@maha.gov.in | Viewer@2026 |

The login screen provides one-click autofill for all roles.

---

## Enable Real Email Alerts (Optional)

The app works out of the box in **mock mode** (alerts logged to stdout + visible in `/alerts` page). To send real emails:

Edit `backend/.env`:
```ini
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"       # Gmail: use App Password not account password
SMTP_FROM="procurement@maha.gov.in"
SMTP_TLS=true
```

Restart backend. The Alerts page SMTP status indicator will turn **green**.

---

## Upload Fresh Data

1. Login as Super Admin
2. Go to **Data Management** in sidebar
3. Drag-drop an ABCD-format workbook (8 sheets: A/B/C/D × Medicine/Equipment)
4. Toggle **Replace existing records** if you want to wipe and reload
5. Click **Upload & Ingest**

The ETL pipeline auto-detects headers, parses ₹ values, classifies records by statement, and computes risk + next-best-action.

---

## Project Structure

```
procurement-dashboard/
├── backend/
│   ├── server.py              # FastAPI app + all /api routes
│   ├── auth.py                # JWT + bcrypt + RBAC
│   ├── models.py              # Pydantic models + enums
│   ├── etl.py                 # Excel parser + classifier
│   ├── kpi_engine.py          # 10 KPI group aggregators
│   ├── exports.py             # PDF (reportlab) + Excel (xlsxwriter)
│   ├── alerts.py              # Alert engine + SMTP
│   ├── scheduler.py           # APScheduler (hourly cron)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── contexts/          # Auth + Filter contexts
│   │   ├── components/        # Layout, Sidebar, KPICard, charts, etc
│   │   └── pages/             # 10 route pages
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env.example
├── uploaded_data/
│   └── abcd.xlsx              # seed data (Maharashtra PHD)
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── README.md
```

---

## API Reference (Highlights)

Auth: `POST /api/auth/login` · `GET /api/auth/me`  
KPIs: `GET /api/kpi/{executive|statements|payment|tender|backlog|risk|category|department|governance}`  
Actions: `GET /api/actions` · `PUT /api/records/{id}` · `POST /api/records/{id}/escalate`  
Alerts: `GET /api/alerts` · `PUT /api/alerts/{id}/resolve` · `POST /api/alerts/run-check` · `POST /api/alerts/run-escalation`  
Export: `GET /api/export/pdf` · `GET /api/export/excel`  
Admin: `POST /api/admin/upload` · `GET /api/admin/uploads` · `GET /api/admin/users`  
Meta: `GET /api/meta/filters` · `GET /api/health`

All KPI endpoints accept optional query params: `?fy=2024-25&department=X&category=Medicine&risk_level=Critical&statement=A&value_min=10`

---

## Troubleshooting

**Frontend can't reach backend** → Verify `REACT_APP_BACKEND_URL` in `frontend/.env` matches backend host. Default: `http://localhost:8001`.

**MongoDB connection failure** → Confirm `MONGO_URL` in `backend/.env`. Default: `mongodb://localhost:27017`. For docker-compose it's `mongodb://mongodb:27017`.

**No data loaded** → Check backend logs for `Seeded N records` message. If seed file is missing, ensure `uploaded_data/abcd.xlsx` exists and `SEED_EXCEL_PATH` in `.env` points to it.

**Emails not sending** → Normal in default (mock) mode. Configure SMTP_* env vars for real sending. Check backend logs for `[EMAIL-MOCK]` or `[EMAIL-SENT]` entries.

**Port already in use** → Change ports in `docker-compose.yml` or pass `--port XXXX` to uvicorn / set `PORT=XXXX` for React.

---

## Tech Stack

- **Backend**: FastAPI 0.110, Motor 3.3 (async MongoDB), PyJWT, bcrypt, openpyxl, reportlab, xlsxwriter, APScheduler
- **Frontend**: React 19, Tailwind CSS, shadcn/ui, Recharts, Axios, React Router 6, lucide-react, Sonner (toasts)
- **Database**: MongoDB 6+
- **Fonts**: Playfair Display (headings), IBM Plex Sans (body), IBM Plex Mono (data)

---

## Security Notes

- JWT tokens expire in 12 hours (configurable via `JWT_EXPIRES_MINUTES`)
- Bcrypt cost factor 12 for password hashing
- Audit log on every data mutation
- Row-level security: Dept Heads see only their department's records
- **Change `JWT_SECRET`** in production

---

## License

Confidential — Government Use Only. © 2026 Government of Maharashtra.
