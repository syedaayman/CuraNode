# CuraNode — Intelligent Emergency Response & Healthcare Telemetry

CuraNode is an AI-powered medical emergency response platform providing real-time injury severity triage, intelligent hospital dispatch matching, automated countdown escalation, and telemetry tracking.

---

## 🛠 Project Structure

- **`userSide/`**: Next.js 15 Patient-Facing Application (UI, Map telemetry, Photo capture, Triage modals).
- **`backend/`**: Python FastAPI Server (Gemini AI Vision Triage, Supabase Database management, OSRM Road Routing, WebSockets).
- **`docs/`**: Architecture documentation and design specifications.
- **`scripts/`**: Development and database schema utility scripts.

---

## 🚀 Quickstart Guide

### 1. Start Backend Server
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```
The FastAPI backend server starts on `http://localhost:8000`.

### 2. Start User-Side Frontend
```bash
cd userSide
npm install
npm run dev
```
The Next.js frontend application starts on `http://localhost:3000`.

---

## 🧪 Running Verification Tests

To verify backend connectivity and Supabase database integration:
```bash
cd backend
.venv\Scripts\python.exe tests/test_supabase_truth_flow.py
.venv\Scripts\python.exe tests/test_accept_verification.py
.venv\Scripts\python.exe tests/test_escalation_verification.py
.venv\Scripts\python.exe tests/test_predict.py
```

---

## 📄 License & Telemetry
CuraNode Emergency Telemetry Network © 2026 — All Rights Reserved.
