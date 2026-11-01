"""
Step 7 - Mandi Cast SMS alerts.

Lets a farmer subscribe a phone number to a crop+market, and sends an SMS
via Twilio whenever that crop-market's recommendation is SELL NOW or the
price crosses a meaningful threshold. This is the accessibility feature
that reaches farmers who don't use smartphones/apps.

Setup:
    1. Sign up for a free Twilio account: https://www.twilio.com/try-twilio
    2. Get a trial phone number from the Twilio console
    3. export TWILIO_ACCOUNT_SID=xxxx
       export TWILIO_AUTH_TOKEN=xxxx
       export TWILIO_FROM_NUMBER=+1xxxxxxxxxx   (your Twilio trial number)
    4. On the free trial, you can only SEND to phone numbers you've
       verified in the Twilio console (Verified Caller IDs) - fine for a
       demo with your own number, won't work for real farmers until you
       upgrade to a paid account.

Run standalone to test:
    python alerts.py --demo                     # prints instead of sending, no Twilio account needed
    python alerts.py --to "+919876543210" --demo # test the message format for one number
"""

import argparse
import csv
import os
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(__file__)
SUBSCRIBERS_FILE = os.path.join(BASE_DIR, "data", "subscribers.csv")

MESSAGES = {
    "English": "{crop} in {market}: {rec} at Rs.{price}/quintal. {reason}",
    "Tamil": "{market} - {crop}: {rec} - Rs.{price}/quintal. {reason}",
    "Hindi": "{market} - {crop}: {rec} - Rs.{price}/quintal. {reason}",
}


def ensure_subscribers_file():
    os.makedirs(os.path.dirname(SUBSCRIBERS_FILE), exist_ok=True)
    if not os.path.exists(SUBSCRIBERS_FILE):
        with open(SUBSCRIBERS_FILE, "w", newline="") as f:
            csv.writer(f).writerow(["phone", "crop", "market", "language", "subscribed_at"])


def subscribe(phone, crop, market, language="English"):
    """Add a phone number to the alert list for a crop+market. Called by the API."""
    ensure_subscribers_file()
    # avoid duplicate subscriptions for the same phone+crop+market
    existing = list_subscribers()
    if any(s["phone"] == phone and s["crop"] == crop and s["market"] == market for s in existing):
        return {"status": "already_subscribed"}

    with open(SUBSCRIBERS_FILE, "a", newline="") as f:
        csv.writer(f).writerow([phone, crop, market, language, datetime.now(timezone.utc).isoformat()])
    return {"status": "subscribed"}


def list_subscribers(crop=None, market=None):
    ensure_subscribers_file()
    with open(SUBSCRIBERS_FILE) as f:
        rows = list(csv.DictReader(f))
    if crop:
        rows = [r for r in rows if r["crop"] == crop]
    if market:
        rows = [r for r in rows if r["market"] == market]
    return rows


def format_message(insight, crop_name, market, language="English"):
    template = MESSAGES.get(language, MESSAGES["English"])
    rec = insight["recommendation"]
    reason = insight["message"]
    return template.format(crop=crop_name, market=market, rec=rec, price=insight["price"], reason=reason)


def send_sms(to_number, body, demo=False):
    """Send via Twilio, or just print the message in --demo mode."""
    if demo:
        print(f"  [DEMO SMS to {to_number}] {body}")
        return {"status": "demo_sent", "to": to_number, "body": body}

    from twilio.rest import Client
    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    auth_token = os.environ["TWILIO_AUTH_TOKEN"]
    from_number = os.environ["TWILIO_FROM_NUMBER"]

    client = Client(account_sid, auth_token)
    message = client.messages.create(body=body, from_=from_number, to=to_number)
    return {"status": "sent", "sid": message.sid, "to": to_number}


def notify_subscribers_if_needed(insight, crop_id, crop_name, market, demo=False):
    """
    Called after generating a fresh insight (e.g. from a scheduled job).
    Only sends SMS when the recommendation is actionable (SELL NOW), to
    avoid spamming farmers with "prices are stable" messages every day.
    """
    if insight["recommendation"] != "SELL NOW":
        return []

    subscribers = list_subscribers(crop=crop_id, market=market)
    results = []
    for sub in subscribers:
        body = format_message(insight, crop_name, market, sub.get("language", "English"))
        result = send_sms(sub["phone"], body, demo=demo)
        results.append(result)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="print messages instead of sending via Twilio")
    parser.add_argument("--to", help="send/print a single test message to this number")
    args = parser.parse_args()

    sample_insight = {
        "recommendation": "SELL NOW",
        "price": 1389.12,
        "message": "Prices are trending down and expected to fall about 12.0% over the next 7 days.",
    }

    if args.to:
        body = format_message(sample_insight, "Tomato", "Mattuthavani Mandi")
        send_sms(args.to, body, demo=args.demo)
        return

    # simulate: subscribe a couple of test numbers, then trigger a notification round
    subscribe("+910000000001", "tomato", "Mattuthavani Mandi")
    subscribe("+910000000002", "tomato", "Mattuthavani Mandi")

    results = notify_subscribers_if_needed(sample_insight, "tomato", "Tomato", "Mattuthavani Mandi", demo=args.demo)
    print(f"\nNotified {len(results)} subscriber(s).")


if __name__ == "__main__":
    main()
