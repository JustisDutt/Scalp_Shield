
import os
import pandas as pd
import numpy as np
import streamlit as st

MODEL_PATH = "models/model.pkl"
FEATURES_IMPORT_PATH = "api.features"

@st.cache_data(show_spinner=False)
def load_data(csv_path: str):
    df = pd.read_csv(csv_path)
    if "purchase_time" in df.columns:
        df["purchase_time"] = pd.to_datetime(df["purchase_time"], errors="coerce", utc=True)
    return df

def heuristic_score(df: pd.DataFrame) -> np.ndarray:
    """Fallback scalp probability when no model is available."""
    d = df.copy()
    amt_mean = d.groupby("account_id")["amount"].transform("mean")
    amt_std = d.groupby("account_id")["amount"].transform("std").replace(0, np.nan)
    amt_z = ((d["amount"] - amt_mean) / amt_std).fillna(0.0)
    if "purchase_time" in d.columns:
        d = d.sort_values(["account_id", "purchase_time"]).reset_index(drop=True)
        secs_prev = d.groupby("account_id")["purchase_time"].diff().dt.total_seconds().fillna(60*60*24)
        mins_prev = secs_prev / 60.0
    else:
        mins_prev = pd.Series(60.0, index=d.index)
    new_ip = d.groupby("account_id")["ip"].transform(lambda s: (~s.astype("object").duplicated()).astype(int))
    z = 0.8*amt_z.clip(-3, 5) + (-0.01)*mins_prev.clip(0, 240) + 0.8*new_ip
    p = 1.0 / (1.0 + np.exp(-z))
    return p.to_numpy()

def infer_probs_with_model(df: pd.DataFrame) -> np.ndarray | None:
    try:
        import joblib
        from importlib import import_module
        build_features_df = import_module(FEATURES_IMPORT_PATH).build_features_df  # type: ignore
        clf = joblib.load(MODEL_PATH)
        X, y, _ = build_features_df(df, fit_stats=False)
        return clf.predict_proba(X)[:, 1]
    except Exception:
        return None

def assign_flag(p: float, yellow_low: float, red_low: float) -> str:
    if p >= red_low:
        return "🟥 red"
    if p >= yellow_low:
        return "🟨 yellow"
    return "🟩 green"

def main():
    st.set_page_config(page_title="ScalpShield Dashboard", layout="wide")
    st.title("ScalpShield — Purchases & Risk Flags")
    colL, colR = st.columns([3, 2], gap="large")

    with st.sidebar:
        st.markdown("### Data source")
        default_csv = "data/synthetic_purchases.csv"
        csv_path = st.text_input("CSV path", value=default_csv)
        uploaded = st.file_uploader("...or upload a CSV", type=["csv"])
        if uploaded:
            df = pd.read_csv(uploaded)
            if "purchase_time" in df.columns:
                df["purchase_time"] = pd.to_datetime(df["purchase_time"], errors="coerce", utc=True)
        else:
            if not os.path.exists(csv_path):
                st.error(f"CSV not found: {csv_path}")
                st.stop()
            df = load_data(csv_path)

        st.markdown("---")
        st.markdown("### Scoring")
        use_model = st.toggle("Use trained model (models/model.pkl) if available", value=True)
        yellow_low = st.slider("Yellow threshold (≥)", 0.0, 1.0, 0.30, 0.01)
        red_low = st.slider("Red threshold (≥)", 0.0, 1.0, 0.70, 0.01)

    probs = infer_probs_with_model(df) if use_model else None
    if probs is None:
        probs = heuristic_score(df)

    with colR:
        st.markdown("### Filters")
        min_time, max_time = None, None
        if "purchase_time" in df.columns and df["purchase_time"].notna().any():
            dt_min = df["purchase_time"].min()
            dt_max = df["purchase_time"].max()
            sel = st.date_input("Date range", value=(dt_min.date(), dt_max.date()))
            if isinstance(sel, tuple) and len(sel) == 2:
                min_time = pd.Timestamp(sel[0]).tz_localize("UTC", nonexistent="shift_forward", ambiguous="NaT")
                max_time = pd.Timestamp(sel[1]).tz_localize("UTC", nonexistent="shift_forward", ambiguous="NaT") + pd.Timedelta(days=1)
        acct = st.text_input("Account contains", value="")
        ipq = st.text_input("IP contains", value="")
        prod = st.text_input("Product contains", value="")

    df_v = df.copy()
    df_v["scalp_prob"] = probs
    df_v["flag"] = [assign_flag(p, yellow_low, red_low) for p in df_v["scalp_prob"]]
    if "purchase_time" in df_v.columns:
        df_v = df_v.sort_values("purchase_time", ascending=False)

    mask = pd.Series(True, index=df_v.index)
    if min_time is not None and max_time is not None and "purchase_time" in df_v.columns:
        mask &= (df_v["purchase_time"] >= min_time) & (df_v["purchase_time"] < max_time)
    if acct:
        mask &= df_v["account_id"].astype(str).str.contains(acct, case=False, na=False)
    if ipq:
        mask &= df_v["ip"].astype(str).str.contains(ipq, case=False, na=False)
    if prod:
        mask &= df_v["product_id"].astype(str).str.contains(prod, case=False, na=False)
    df_v = df_v[mask]

    with colL:
        st.markdown("### Purchases")
        cols = ["flag", "scalp_prob", "purchase_time", "account_id", "ip", "product_id", "amount"]
        present = [c for c in cols if c in df_v.columns]
        st.dataframe(
            df_v[present].reset_index(drop=True),
            use_container_width=True,
            hide_index=True,
            column_config={
                "flag": st.column_config.TextColumn("Flag"),
                "scalp_prob": st.column_config.NumberColumn("Scalp probability", format="%.3f"),
                "amount": st.column_config.NumberColumn("Amount", format="%.2f"),
                "purchase_time": st.column_config.DatetimeColumn("Time (UTC)"),
            }
        )

    with colR:
        st.markdown("### Flag summary")
        total = len(df_v)
        reds = int((df_v["flag"] == "🟥 red").sum())
        yellows = int((df_v["flag"] == "🟨 yellow").sum())
        greens = int((df_v["flag"] == "🟩 green").sum())
        st.metric("Rows shown", total)
        c1, c2, c3 = st.columns(3)
        c1.metric("Red", reds)
        c2.metric("Yellow", yellows)
        c3.metric("Green", greens)

        st.markdown("---")
        st.caption("Adjust thresholds in the sidebar. If a trained model exists, keep it at models/model.pkl.")

if __name__ == "__main__":
    main()
