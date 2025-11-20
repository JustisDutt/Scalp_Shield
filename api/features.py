import pandas as pd
import numpy as np
from .utils import ensure_datetime_col, safe_group_cumdiff_seconds, set_sorted_dtindex

def build_features_df(df: pd.DataFrame, fit_stats: bool = True):
    df = df.copy()
    df = ensure_datetime_col(df, "purchase_time")
    df = df.sort_values(["account_id", "purchase_time"]).reset_index(drop=True)

    def _tickets_rate(group: pd.DataFrame) -> pd.Series:
        g = set_sorted_dtindex(group, "purchase_time")
        rate = g["num_tickets"].rolling("15min").sum() / 15.0
        rate = rate.reset_index(drop=False)
        rate.index = group.sort_values("purchase_time").index
        rate = rate.reindex(group.index)
        return rate.iloc[:, 1]

    df["tickets_per_minute_by_account_15m"] = (
        df.groupby("account_id", group_keys=False)[["purchase_time", "num_tickets"]]
          .apply(_tickets_rate)
          .astype(float)
          .fillna(0.0)
    )

    df["cum_unique_ips_by_account"] = (
        df.groupby("account_id")["ip"]
          .transform(lambda s: (~s.astype('object').duplicated()).cumsum())
          .astype(float)
    )

    df["secs_since_prev_purchase_account"] = safe_group_cumdiff_seconds(df, "account_id", "purchase_time").astype(float)

    amt_mean = df.groupby("account_id")["amount"].transform("mean")
    amt_std = df.groupby("account_id")["amount"].transform("std").replace(0, np.nan)
    df["amount_z_by_account"] = ((df["amount"] - amt_mean) / amt_std).fillna(0.0)

    df["product_id_code"] = df["product_id"].astype("category").cat.codes.astype(int)

    # Label
    if "scalp_flag" in df.columns:
        y = df["scalp_flag"].astype(int).values
    else:
        y = None

    feature_cols = [
        "tickets_per_minute_by_account_15m",
        "cum_unique_ips_by_account",
        "secs_since_prev_purchase_account",
        "amount_z_by_account",
        "product_id_code",
        "amount",
    ]
    X = df[feature_cols].astype(float).values
    artifacts = {
        "feature_cols": feature_cols,
        "product_id_categories": df["product_id"].astype("category").cat.categories.tolist()
    }
    return X, y, artifacts
