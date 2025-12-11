from typing import List
import math


def probability_to_flag(prob: float) -> str:
    """
    Map a probability into a traffic light flag.
    """
    if prob < 0.30:
        return "green"
    if prob < 0.65:
        return "yellow"
    return "red"


def build_explanations(row: dict, prob: float, flag: str) -> List[str]:
    explanations: List[str] = []

    def get_num(name: str, default: float = 0.0) -> float:
        val = row.get(name, default)
        try:
            if val is None or (isinstance(val, float) and math.isnan(val)):
                return default
            return float(val)
        except Exception:
            return default

    tickets = get_num("tickets", 0.0)
    total_amount = get_num("total_amount", 0.0)
    ip_24h = get_num("ip_purchase_count_24h", 0.0)
    user_30d = get_num("user_purchase_count_30d", 0.0)
    account_age = get_num("user_account_age_days", 365.0)
    same_card_24h = get_num("same_card_purchase_count_24h", 0.0)

    device_info_raw = row.get("device_info") or ""
    device_info = str(device_info_raw).lower()

    if tickets >= 10:
        explanations.append("High ticket volume (>= 10 tickets in a single purchase).")

    if total_amount >= 500:
        explanations.append("High total spend (>= 500 units in this purchase).")

    if ip_24h >= 10:
        explanations.append("Many purchases from the same IP in the last 24 hours.")

    if user_30d >= 20:
        explanations.append("Unusually high number of purchases from this user in the last 30 days.")

    if account_age <= 7:
        explanations.append("Very new account (<= 7 days old).")
    elif account_age <= 30:
        explanations.append("Relatively new account (<= 30 days old).")

    if same_card_24h >= 5:
        explanations.append("Many purchases on the same card in the last 24 hours.")

    suspicious_keywords = ["bot", "headless", "selenium", "scrapy", "curl", "python-requests"]
    if any(keyword in device_info for keyword in suspicious_keywords):
        explanations.append("Suspicious device or automation signature detected in device information.")

    if not explanations:
        if flag == "red":
            explanations.append(
                "Overall pattern of activity looks highly similar to known risky behavior."
            )
        elif flag == "yellow":
            explanations.append(
                "Activity shows some risk indicators but is not strongly suspicious."
            )
        else:
            explanations.append(
                "No strong risk indicators detected based on current variables."
            )

    explanations.append(f"Model probability of suspicious activity: {prob:.2f}.")
    return explanations
