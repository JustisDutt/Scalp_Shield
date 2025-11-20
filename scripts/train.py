import os, json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score, f1_score
from api.features import build_features_df
import joblib

DATA_PATH = "data/synthetic_purchases.csv"

def load_data(path: str) -> pd.DataFrame:
    return pd.read_csv(path)

def pick_best_threshold(y_true, y_proba):
    thresholds = np.linspace(0.05, 0.95, 19)
    best_t, best_f1 = 0.5, -1.0
    for t in thresholds:
        y_hat = (y_proba >= t).astype(int)
        f1 = f1_score(y_true, y_hat, zero_division=0)
        if f1 > best_f1:
            best_f1, best_t = f1, t
    return best_t, best_f1

def train():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Missing {DATA_PATH}. Run: python .\\data\\generate_synth.py --rows 3000")

    df = load_data(DATA_PATH)
    X, y, artifacts = build_features_df(df, fit_stats=True)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    X_tr, X_val, y_tr, y_val = train_test_split(X_train, y_train, test_size=0.20, random_state=42, stratify=y_train)

    clf = RandomForestClassifier(
        n_estimators=400,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced',
        min_samples_leaf=2
    )
    clf.fit(X_tr, y_tr)

    y_proba_val = clf.predict_proba(X_val)[:, 1]
    best_t, best_f1 = pick_best_threshold(y_val, y_proba_val)

    y_proba_test = clf.predict_proba(X_test)[:, 1]
    y_hat_test_05 = (y_proba_test >= 0.5).astype(int)
    y_hat_test_tuned = (y_proba_test >= best_t).astype(int)

    report_05 = classification_report(y_test, y_hat_test_05, digits=4, zero_division=0, target_names=["non-scalp", "scalp"])
    report_tuned = classification_report(y_test, y_hat_test_tuned, digits=4, zero_division=0, target_names=["non-scalp", "scalp"])
    auc = roc_auc_score(y_test, y_proba_test)

    os.makedirs("models", exist_ok=True)
    os.makedirs("artifacts", exist_ok=True)
    joblib.dump(clf, "models/model.pkl")
    with open("artifacts/feature_artifacts.json", "w", encoding="utf-8") as f:
        json.dump(artifacts, f, indent=2)
    with open("artifacts/metrics.txt", "w", encoding="utf-8") as f:
        f.write(f"Best threshold (val): {best_t:.2f}, F1={best_f1:.4f}\n\n")
        f.write("Test @0.5 threshold (labels: non-scalp, scalp):\n")
        f.write(report_05 + "\n")
        f.write("Test @tuned threshold (labels: non-scalp, scalp):\n")
        f.write(report_tuned + "\n")
        f.write(f"ROC AUC (probability of scalp): {auc:.4f}\n")

    print("Training complete.")
    print(f"Best threshold (val): {best_t:.2f}, F1={best_f1:.4f}")
    print("\nTest @0.5 threshold (labels: non-scalp, scalp):")
    print(report_05)
    print("Test @tuned threshold (labels: non-scalp, scalp):")
    print(report_tuned)
    print(f"ROC AUC (probability of scalp): {auc:.4f}")

if __name__ == "__main__":
    train()
