const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type RiskFlag = "green" | "yellow" | "red";

export interface PurchaseRow {
  row_index: number;
  probability: number;
  flag: RiskFlag;
  explanations: string[];
  raw: Record<string, any>;
  transaction_id?: string | null;
  user_id?: string | null;
  event_id?: string | null;
  timestamp?: string | null;
}

export interface PredictionSummary {
  count_total: number;
  count_green: number;
  count_yellow: number;
  count_red: number;
}

export interface PredictResponse {
  rows: PurchaseRow[];
  summary: PredictionSummary;
}

export async function uploadCsv(file: File): Promise<PredictResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/predict`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    let message = "Failed to get predictions.";
    try {
      const data = await res.json();
      if (data && data.detail) {
        message = Array.isArray(data.detail)
          ? data.detail.map((d: any) => d.msg || d.detail).join(", ")
          : data.detail;
      }
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }

  return res.json();
}
