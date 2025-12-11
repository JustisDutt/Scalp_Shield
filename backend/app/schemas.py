from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class RowPrediction(BaseModel):
    row_index: int
    probability: float
    flag: str
    explanations: List[str]
    raw: Dict[str, Any]
    transaction_id: Optional[str] = None
    user_id: Optional[str] = None
    event_id: Optional[str] = None
    timestamp: Optional[str] = None


class PredictionSummary(BaseModel):
    count_total: int
    count_green: int
    count_yellow: int
    count_red: int


class PredictResponse(BaseModel):
    rows: List[RowPrediction]
    summary: PredictionSummary
