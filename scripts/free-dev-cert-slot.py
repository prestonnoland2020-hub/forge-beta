#!/usr/bin/env python3
"""Free an Apple Development certificate slot before CI signs.

Every fresh GitHub Mac runner has an empty keychain, so Xcode's automatic
signing asks Apple for a NEW "Apple Development" certificate each build. Their
private keys vanish with the runner, so those certificates can never be used
again, and after a few builds Apple refuses with "Your account has reached the
maximum number of certificates" (every TestFlight build since Nov 16).

This revokes only certificates that CI itself made through the App Store
Connect API (Apple names them "Created via API"). A certificate made on
someone's Mac in Xcode keeps its own name and is never touched. Revoking a
development certificate does not affect apps already on TestFlight or the App
Store, which are signed with a distribution certificate.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH. Needs PyJWT + cryptography.
"""
import json, os, sys, time, urllib.request, urllib.error
import jwt

API = "https://api.appstoreconnect.apple.com/v1"
key = open(os.environ["ASC_KEY_PATH"]).read()
now = int(time.time())
token = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
                   key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})

def call(method, url, tries=3):
    """Apple's API sometimes answers 500 for a moment; retry, then say what it said."""
    for attempt in range(tries):
        req = urllib.request.Request(url, method=method, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                body = res.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:500]
            print(f"{method} {url.split('?')[0]} -> HTTP {error.code} (try {attempt + 1}/{tries}): {detail}", file=sys.stderr)
            if error.code < 500 or attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))

# No sparse-fieldset filter: the bracketed query (fields[certificates]=...) got
# HTTP 500 from Apple on Nov 17. A plain list is small enough.
certs, url = [], f"{API}/certificates?limit=200"
try:
    while url:
        page = call("GET", url)
        certs += page.get("data", [])
        url = page.get("links", {}).get("next")
except urllib.error.HTTPError as error:
    # Listing failed: carry on to the archive rather than stop here; if the
    # account is still full, Xcode's own error says so.
    print(f"Could not list certificates (HTTP {error.code}); skipping cleanup.", file=sys.stderr)
    sys.exit(0)

dev = [c for c in certs if c["attributes"].get("certificateType") in ("DEVELOPMENT", "IOS_DEVELOPMENT")]
print(f"{len(certs)} certificates on the team, {len(dev)} development:")
for c in dev:
    a = c["attributes"]
    print(f"  {a.get('certificateType')} | {a.get('name')} | {a.get('displayName')} | expires {a.get('expirationDate')}")

ci_made = [c for c in dev if "created via api" in f"{c['attributes'].get('name')} {c['attributes'].get('displayName')}".lower()]
if not ci_made:
    print("No CI-made development certificates to revoke.")
    sys.exit(0)
for c in ci_made:
    try:
        call("DELETE", f"{API}/certificates/{c['id']}")
        print(f"Revoked CI-made certificate {c['id']} ({c['attributes'].get('displayName')}).")
    except urllib.error.HTTPError as error:
        print(f"Could not revoke {c['id']}: HTTP {error.code}", file=sys.stderr)
