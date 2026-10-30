# Nifty 50 Financial Reports Platform (NSE India)

A full-stack financial intelligence platform built with **Next.js**, **React**, **FastAPI (Python)**, and **NSE India Live API Integration**.

It provides complete financial statements, quarterly audited/unaudited filings (SEBI Reg 33), annual reports, and balance sheets for **all 50 constituent companies in the Nifty 50 index**.

---

## 🚀 Live Access

- **Next.js Web UI**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **Interactive API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🏛️ Features

1. **All 50 Nifty 50 Companies Supported**:
   - Complete coverage: Reliance, TCS, HDFC Bank, Bharti Airtel, ICICI Bank, Infosys, SBI, ITC, L&T, etc.
   - Categorized by official sector classifications (IT, Banking, Energy, FMCG, Auto, Healthcare, Metals, Utilities, etc.).

2. **Official NSE Filings & PDF Reports**:
   - Direct links to official annual report PDFs submitted to NSE (`nsearchives.nseindia.com`).
   - SEBI Regulation 33 Quarterly financial filings & limited review certificates.
   - Real-time "Sync Live with NSE" button utilizing TLS Chrome impersonation (`curl_cffi`) to query active corporate announcements.

3. **Interactive Financial Statement Reader**:
   - **Quarterly P&L**: Operations Revenue, Total Income, Operating Expenses, EBITDA, Operating Margin %, Depreciation, Finance Costs, PBT, Tax, PAT (Net Profit), EPS.
   - **Annual P&L Statements**: Multi-year consolidated financial comparisons (FY25 vs FY24).
   - **Balance Sheet & Solvency**: Assets, Equity, Debt, Cash & Liquid Equivalents, Debt-to-Equity, ROE %, ROCE %.

4. **Modern UI & Filtering**:
   - Built with Next.js & Vanilla CSS with modern glassmorphism.
   - Real-time search across symbols, company names, and industries.
   - Filter by Sector pills and sort by Market Cap, Revenue, Profit, or P/E Ratio.
   - In-dashboard modal reader or dedicated permalink page (`/company/[symbol]`).

---

## 🛠️ Architecture

```
d:\Algo Robot\
├── backend/                  # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py           # REST API endpoints & CORS middleware
│   │   ├── models.py         # Pydantic data schemas
│   │   ├── nse_client.py     # Live NSE India scraper client with browser impersonation
│   │   └── companies_data.py # Curated database of all 50 Nifty 50 companies & statements
│   └── run_backend.py        # Backend server launcher (Port 8000)
│
├── frontend/                 # Next.js Modern React Application (Port 3000)
│   ├── src/app/
│   │   ├── page.tsx          # Main Dashboard & Interactive Financial Report Reader
│   │   ├── company/[symbol]/ # Dedicated individual company permalink page
│   │   ├── globals.css       # Design tokens & glassmorphism system
│   │   └── layout.tsx
│   └── package.json
│
└── run_platform.py           # Unified launcher
```

---

## 💻 Manual Commands

### Start Python Backend:
```bash
& "d:\Algo Robot\.venv\Scripts\python.exe" backend/run_backend.py
```

### Start Next.js Frontend:
```bash
cd frontend
npm run dev
```
