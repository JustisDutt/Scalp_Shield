from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import io
from pathlib import Path

import pandas as pd
import numpy as np
import xgboost as xgb

from .schemas import PredictResponse, RowPrediction, PredictionSummary
from .explanations import probability_to_flag, build_explanations


REQUIRED_COLUMNS = [
    "minutes_since_release",
    "tickets",
    "total_amount",
    "ip_purchase_count_24h",
    "user_purchase_count_30d",
    "user_account_age_days",
    "same_card_purchase_count_24h",
]

FEATURE_COLUMNS = REQUIRED_COLUMNS[:]


def load_model() -> xgb.Booster:
    here = Path(__file__).resolve().parent
    model_path = here / "model_xgb.json"
    if not model_path.exists():
        raise RuntimeError(f"XGBoost model file not found at {model_path}")
    booster = xgb.Booster()
    booster.load_model(model_path.as_posix())
    return booster


xgb_model = load_model()

app = FastAPI(title="ScalpShield XGBoost API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> Dict[str, str]:
    return {"status": "ok", "message": "ScalpShield XGBoost API"}


@app.post("/api/predict", response_model=PredictResponse)
async def predict(file: UploadFile = File(...)) -> PredictResponse:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read CSV: {exc}")

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}",
        )

    for col in REQUIRED_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df[REQUIRED_COLUMNS] = df[REQUIRED_COLUMNS].fillna(
        {
            "minutes_since_release": 0.0,
            "tickets": 0.0,
            "total_amount": 0.0,
            "ip_purchase_count_24h": 0.0,
            "user_purchase_count_30d": 0.0,
            "user_account_age_days": 365.0,
            "same_card_purchase_count_24h": 0.0,
        }
    )

    X = df[FEATURE_COLUMNS].astype(float).values
    dmat = xgb.DMatrix(X, feature_names=FEATURE_COLUMNS)
    probs = xgb_model.predict(dmat)

    rows: List[RowPrediction] = []

    def to_python_value(x: Any) -> Any:
        if isinstance(x, (np.generic,)):
            return x.item()
        if pd.isna(x):
            return None
        return x

    for idx, (row_idx, row) in enumerate(df.iterrows()):
        row_dict = {col: to_python_value(row[col]) for col in df.columns}
        prob = float(probs[idx])
        flag = probability_to_flag(prob)
        explanations = build_explanations(row_dict, prob, flag)

        rp = RowPrediction(
            row_index=int(row_idx),
            probability=round(prob, 4),
            flag=flag,
            explanations=explanations,
            raw=row_dict,
            transaction_id=str(row_dict.get("transaction_id"))
            if row_dict.get("transaction_id") not in (None, "")
            else None,
            user_id=str(row_dict.get("user_id"))
            if row_dict.get("user_id") not in (None, "")
            else None,
            event_id=str(row_dict.get("event_id"))
            if row_dict.get("event_id") not in (None, "")
            else None,
            timestamp=str(row_dict.get("timestamp"))
            if row_dict.get("timestamp") not in (None, "")
            else None,
        )
        rows.append(rp)

    summary = PredictionSummary(
        count_total=len(rows),
        count_green=sum(1 for r in rows if r.flag == "green"),
        count_yellow=sum(1 for r in rows if r.flag == "yellow"),
        count_red=sum(1 for r in rows if r.flag == "red"),
    )

    return PredictResponse(rows=rows, summary=summary)
