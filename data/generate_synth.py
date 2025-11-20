import argparse, random, math
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone

def random_ip():
    return ".".join(str(random.randint(1, 254)) for _ in range(4))

def main(rows: int):
    rng = np.random.default_rng(42)
    accounts = [f"A{str(i).zfill(4)}" for i in range(100)]
    products = [f"P{str(i).zfill(3)}" for i in range(20)]
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    offsets = rng.integers(0, 60*24*90, size=rows)  # 90 days in minutes
    times = [start + timedelta(minutes=int(i)) for i in sorted(offsets)]

    data = []
    account_last_time = {}
    seen_ip_by_acct = {a: set() for a in accounts}

    for i in range(rows):
        account = random.choice(accounts)
        ip = random_ip()
        product = random.choice(products)
        base_amount = max(rng.normal(50, 20), 1.0)

        # occasional high spenders
        if rng.random() < 0.1:
            base_amount *= rng.uniform(1.8, 3.5)

        amount = round(float(base_amount), 2)

        t = times[i]
        last_t = account_last_time.get(account, t - timedelta(hours=24))
        secs_since_prev = (t - last_t).total_seconds()
        mins_since_prev = secs_since_prev / 60.0

        new_ip = ip not in seen_ip_by_acct[account]

        # update trackers
        account_last_time[account] = t
        seen_ip_by_acct[account].add(ip)

        # Scalp probability
        z = (
            0.5 * (amount / 100.0)
            + (-0.003) * mins_since_prev
            + (0.8 if new_ip else 0.0)
            - 2.0
        )
        p = 1.0 / (1.0 + np.exp(-z))
        scalp_flag = int(rng.random() < p)

        data.append({
            "purchase_time": t.isoformat(),
            "account_id": account,
            "ip": ip,
            "product_id": product,
            "amount": amount,
            "num_tickets": 1,
            "scalp_flag": scalp_flag
        })

    df = pd.DataFrame(data)
    out = "data/synthetic_purchases.csv"
    df.to_csv(out, index=False)
    print(f"Wrote {len(df)} rows to {out} | scalp rate: {df['scalp_flag'].mean():.3f}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=3000)
    args = parser.parse_args()
    main(args.rows)
