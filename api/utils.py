import pandas as pd

def ensure_datetime_col(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if not pd.api.types.is_datetime64_any_dtype(df[col]):
        df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
    return df

def safe_group_cumdiff_seconds(df: pd.DataFrame, group_col: str, time_col: str) -> pd.Series:
    s = df.groupby(group_col)[time_col].diff().dt.total_seconds()
    return s.fillna(0.0)

def set_sorted_dtindex(group: pd.DataFrame, time_col: str) -> pd.DataFrame:
    g = group.sort_values(time_col).copy()
    g = g.set_index(time_col)
    return g
