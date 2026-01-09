<p align="center">
  <img src="frontend/public/scalpshield-logo.png" alt="ScalpShield logo" width="200" />
</p>

# ScalpShield

## Overview
ScalpShield is an end-to-end fraud detection system designed to identify and classify high-risk ticket scalping activity in real time. The project combines a machine learning risk model with a backend API and a web dashboard to surface actionable fraud signals in a clear, operational workflow.

This project was built to demonstrate production-oriented system design: data ingestion, feature engineering, model training, API integration, and frontend visualization working together as a single system.

---

## Problem Statement
Ticket scalping and automated resale introduce fraud risk, price manipulation, and unfair market access. Most example ML projects stop at offline model training. ScalpShield focuses on the harder problem: **deploying a trained model into a usable system** that can evaluate events in real time and explain its decisions.

---

## System Architecture

**High-level flow:**
1. Raw ticket activity data is ingested as CSV input.
2. Features are engineered and passed into a trained XGBoost model.
3. The model outputs a risk score and classification.
4. A FastAPI backend exposes inference endpoints.
5. A dashboard frontend visualizes predictions and explanations.

**Components:**
- **ML Layer:** XGBoost classification model with engineered features
- **Backend API:** FastAPI service handling inference and explanations
- **Frontend:** Dashboard UI for viewing predictions and risk categories
- **Artifacts:** Serialized model and documentation

---

## Tech Stack

**Backend**
- Python
- FastAPI
- Pydantic
- XGBoost

**Machine Learning**
- XGBoost
- Pandas
- NumPy
- Feature engineering pipeline
- CSV-based training and inference

**Frontend**
- Next.js
- TypeScript
- React

**Tooling & Infrastructure**
- Git
- REST APIs
- Local deployment (API + frontend)

---

## Scope and Constraints

**In Scope**
- Offline training with structured CSV data
- Real-time inference via API
- Risk classification (green / yellow / red)
- Model explanation support
- End-to-end system integration

**Out of Scope**
- Live production data feeds
- Authentication and user management
- Cloud deployment hardening
- Model retraining automation

These constraints are intentional to keep the project focused on core ML + backend integration.

---

## Repository Structure

```
Scalp_Shield-main/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI entry point
│   │   ├── train_xgb.py     # Model training pipeline
│   │   ├── model_xgb.json   # Trained model artifact
│   │   ├── schemas.py       # Request/response schemas
│   │   └── explanations.py # Model explanation logic
│   └── requirements.txt
├── frontend/
│   └── (Next.js dashboard)
├── docs/
│   └── Justis_Dutt_Personal_Project_ScalpShield.pdf
└── README.md
```

---

## Running the Project Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## What This Project Demonstrates

- Translating an ML model into a usable product
- Designing clean API boundaries around inference
- Feature engineering aligned with real-world signals
- Clear separation of ML, backend, and frontend concerns
- Production-minded engineering rather than notebook-only ML

---

## Author
**Justis Dutt**  
- Portfolio: https://www.justisdutt.com  
- GitHub: https://github.com/JustisDutt  
- LinkedIn: https://www.linkedin.com/in/justis-dutt-951834224/

---

