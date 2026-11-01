"""
Step 8 - Mandi Cast phone login (OTP).

Sends a 6-digit OTP via regular Twilio SMS (the same trial-friendly
"Messages" API used in alerts.py) and verifies it server-side. Twilio's
Verify Service requires an upgraded/paid account on some trial setups,
so this generates and checks the code ourselves instead - works on a
plain free trial account with just a phone number.

If no Twilio credentials are set, automatically falls back to demo
mode: prints the code to the server console instead of texting it.

Setup for real SMS delivery:
    1. In the Twilio console, get a trial phone number (Phone Numbers -> Manage -> Buy a number, free on trial)
    2. Trial accounts now require a pre-approved message template for
       outbound SMS (can't send arbitrary free-text). Create one:
       - Go to Messaging -> Content Editor -> Create new -> Text
       - Body: "Your Mandi Cast verification code is {{1}}. Valid for 5 minutes."
       - Save, then copy its Content SID (starts with HX...)
       - Submit it for WhatsApp/SMS approval if prompted (usually instant for trial)
    3. export TWILIO_ACCOUNT_SID=xxxx
       export TWILIO_AUTH_TOKEN=xxxx
       export TWILIO_FROM_NUMBER=+1xxxxxxxxxx   (your Twilio trial number)
       export TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxx
    4. Trial accounts can only SEND to numbers verified under
       Phone Numbers -> Manage -> Verified Caller IDs.
    5. If you don't want to set up a template right now, just skip
       TWILIO_CONTENT_SID - send_otp() will fall back to demo mode
       automatically until you add it.
"""

import os
import random
import time

# in-memory store: { phone: (code, expires_at_epoch) }
_codes = {}
OTP_TTL_SECONDS = 300  # 5 minutes


def _twilio_configured():
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"))


def send_otp(phone):
    """Generate a 6-digit OTP, store it, and send it via SMS (or print in demo mode)."""
    code = f"{random.randint(0, 999999):06d}"
    _codes[phone] = (code, time.time() + OTP_TTL_SECONDS)

    if _twilio_configured():
        try:
            from twilio.rest import Client
            client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
            content_sid = os.environ.get("TWILIO_CONTENT_SID")
            if content_sid:
                # Trial accounts require a pre-approved Content Template for
                # outbound SMS - see setup note at the top of this file.
                client.messages.create(
                    content_sid=content_sid,
                    content_variables=f'{{"1":"{code}"}}',
                    from_=os.environ["TWILIO_FROM_NUMBER"],
                    to=phone,
                )
            else:
                client.messages.create(
                    body=f"Your Mandi Cast verification code is {code}. Valid for 5 minutes.",
                    from_=os.environ["TWILIO_FROM_NUMBER"],
                    to=phone,
                )
            return {"status": "sent"}
        except Exception as e:
            # Falls back to demo mode instead of failing the login flow -
            # e.g. if a Content Template hasn't been set up/approved yet.
            print(f"  [Twilio send failed, falling back to demo] {e}")
            print(f"  [DEMO OTP] {phone} -> {code}  (valid {OTP_TTL_SECONDS // 60} min)")
            return {"status": "demo_sent", "twilio_error": str(e)}

    print(f"  [DEMO OTP] {phone} -> {code}  (valid {OTP_TTL_SECONDS // 60} min)")
    return {"status": "demo_sent"}


def verify_otp(phone, code):
    """Check a submitted OTP. Returns {"valid": bool, "reason": str}."""
    entry = _codes.get(phone)
    if not entry:
        return {"valid": False, "reason": "no_otp_sent"}
    stored_code, expires_at = entry
    if time.time() > expires_at:
        del _codes[phone]
        return {"valid": False, "reason": "expired"}
    if code != stored_code:
        return {"valid": False, "reason": "incorrect_code"}
    del _codes[phone]  # one-time use
    return {"valid": True, "reason": "approved"}
