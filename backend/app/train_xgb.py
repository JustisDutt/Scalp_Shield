from pathlib import Path

import numpy as np
import xgboost as xgb

FEATURE_COLUMNS = [
    "minutes_since_release",
    "tickets",
    "total_amount",
    "ip_purchase_count_24h",
    "user_purchase_count_30d",
    "user_account_age_days",
    "same_card_purchase_count_24h",
]


def main() -> None:
    rng = np.random.default_rng(42)
    n = 6000
    rows = []

    for _ in range(n):
        r = rng.random()
        if r < 0.7:
            # mostly normal
            tickets = rng.integers(1, 4)
            price = rng.choice([60, 75, 90, 120])
            ip_24 = rng.integers(0, 6)
            user_30d = rng.integers(0, 12)
            acc_age = rng.integers(30, 400)
            same_card = rng.integers(0, 4)
        elif r < 0.9:
            # medium spicy
            tickets = rng.integers(3, 8)
            price = rng.choice([90, 120, 150, 180])
            ip_24 = rng.integers(3, 18)
            user_30d = rng.integers(5, 25)
            acc_age = rng.integers(7, 200)
            same_card = rng.integers(2, 10)
        else:
            # high risk
            tickets = rng.integers(6, 13)
            price = rng.choice([150, 180, 220])
            ip_24 = rng.integers(10, 40)
            user_30d = rng.integers(15, 60)
            acc_age = rng.integers(0, 40)
            same_card = rng.integers(5, 25)

        minutes_since_release = rng.integers(0, 600)
        total_amount = tickets * price

        score = 0.0
        score += tickets * 0.15
        score += (total_amount / 500.0) * 0.2
        score += ip_24 * 0.04
        score += user_30d * 0.015
        if acc_age <= 7:
            score += 1.0
        elif acc_age <= 30:
            score += 0.4
        score += same_card * 0.06

        prob_like = 1.0 / (1.0 + np.exp(-0.7 * (score - 5.0)))
        label = 1 if prob_like > 0.65 else 0

        rows.append(
            [
                minutes_since_release,
                tickets,
                float(total_amount),
                ip_24,
                user_30d,
                acc_age,
                same_card,
                label,
            ]
        )

    data = np.array(rows, dtype=float)
    X = data[:, :-1]
    y = data[:, -1]

    dtrain = xgb.DMatrix(X, label=y, feature_names=FEATURE_COLUMNS)
    params = {
        "objective": "binary:logistic",
        "max_depth": 4,
        "eta": 0.1,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "eval_metric": "logloss",
    }
    bst = xgb.train(params, dtrain, num_boost_round=120)

    model_path = Path(__file__).resolve().parent / "model_xgb.json"
    bst.save_model(model_path.as_posix())
    print(f"Saved XGBoost model to {model_path}")


if __name__ == "__main__":
    main()
