"""Check / resend / add one TestFlight tester through the App Store Connect API.

status: prints whether the email is a user, has a pending invite, or is a tester.
resend: if the invite is still pending, deletes and recreates it (same role,
        Forge app only), which is what "Resend Invitation" does.
add:    if the email is an accepted user, adds them to the internal group.
invite: (re)sends the TestFlight email for Forge ("View in TestFlight" + redeem code).
"""
import os, sys, time, jwt, requests

API = 'https://api.appstoreconnect.apple.com/v1'
env = os.environ
email = env['TESTER_EMAIL'].strip().lower()
action = env.get('TESTER_ACTION', 'status').strip()

def token():
    now = int(time.time())
    return jwt.encode({'iss': env['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
                      env['ASC_KEY_P8'], algorithm='ES256', headers={'kid': env['ASC_KEY_ID'], 'typ': 'JWT'})

H = {'Authorization': f'Bearer {token()}', 'Content-Type': 'application/json'}

def call(method, path, **kw):
    r = requests.request(method, API + path, headers=H, timeout=30, **kw)
    if r.status_code >= 400:
        print(f'{method} {path} -> HTTP {r.status_code}: {r.text[:400]}')
    return r

def find(path, key, value):
    r = call('GET', f'{path}?filter[{key}]={value}&limit=20')
    if r.status_code >= 400: sys.exit(1)
    return [d for d in r.json().get('data', []) if (d['attributes'].get(key) or d['attributes'].get('email') or '').lower() == value]

users = find('/users', 'username', email)
invites = [] if users else find('/userInvitations', 'email', email)
testers = find('/betaTesters', 'email', email)
inv = invites[0] if invites else None
print(f'STATUS user={bool(users)} pending_invite={bool(inv)} beta_tester={bool(testers)}'
      + (f" invite_expires={inv['attributes'].get('expirationDate')}" if inv else ''))
in_team = False
if testers:
    t = testers[0]
    gr = call('GET', f"/betaTesters/{t['id']}/betaGroups?limit=20")
    groups = [g['id'] for g in gr.json().get('data', [])] if gr.status_code < 400 else []
    print(f"TESTER state={t['attributes'].get('state')} invite_type={t['attributes'].get('inviteType')}"
          f" in_team_group={env['ASC_GROUP_ID'] in groups} groups={len(groups)}")
    in_team = env['ASC_GROUP_ID'] in groups
    st = call('GET', f"/betaTesters/{t['id']}?fields[betaTesters]=state,inviteType,email")
    if st.status_code < 400:
        print(f"TESTER detail state={st.json()['data']['attributes'].get('state')}")
    gb = call('GET', f"/betaGroups/{env['ASC_GROUP_ID']}/builds?limit=5&sort=-uploadedDate&fields[builds]=version,processingState,expired,uploadedDate")
    if gb.status_code < 400:
        for b in gb.json().get('data', [])[:3]:
            a = b['attributes']
            print(f"GROUP build {a.get('version')} {a.get('processingState')} expired={a.get('expired')} uploaded={a.get('uploadedDate')}")
        if not gb.json().get('data'): print('GROUP has NO builds')
    ga = call('GET', f"/betaGroups/{env['ASC_GROUP_ID']}?fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds")
    if ga.status_code < 400: print(f"GROUP {ga.json()['data']['attributes']}")

if action == 'resend':
    if users: print('RESULT already accepted - nothing to resend'); sys.exit(0)
    attrs = {'email': email, 'firstName': env['TESTER_FIRST'], 'lastName': env['TESTER_LAST'],
             'roles': inv['attributes'].get('roles') if inv else ['CUSTOMER_SUPPORT'],
             'allAppsVisible': False, 'provisioningAllowed': False}
    if inv:
        if call('DELETE', f"/userInvitations/{inv['id']}").status_code >= 400: sys.exit(1)
    body = {'data': {'type': 'userInvitations', 'attributes': attrs,
            'relationships': {'visibleApps': {'data': [{'type': 'apps', 'id': env['ASC_APP_ID']}]}}}}
    # Apple takes a few seconds to free the email after a delete (409 DUPLICATE).
    for attempt in range(12):
        r = call('POST', '/userInvitations', json=body)
        if r.status_code != 409: break
        time.sleep(10)
    if r.status_code >= 400: print('RESULT resend FAILED - invite may be gone, run resend again'); sys.exit(1)
    print(f"RESULT invite resent, expires {r.json()['data']['attributes'].get('expirationDate')}")
elif action == 'add':
    if not users: print('RESULT not accepted yet - cannot add to internal group'); sys.exit(0)
    if in_team: print('RESULT already in internal group'); sys.exit(0)
    if testers:
        r = call('POST', f"/betaGroups/{env['ASC_GROUP_ID']}/relationships/betaTesters",
                 json={'data': [{'type': 'betaTesters', 'id': testers[0]['id']}]})
    else:
        r = call('POST', '/betaTesters', json={'data': {'type': 'betaTesters',
                 'attributes': {'email': email, 'firstName': env['TESTER_FIRST'], 'lastName': env['TESTER_LAST']},
                 'relationships': {'betaGroups': {'data': [{'type': 'betaGroups', 'id': env['ASC_GROUP_ID']}]}}}})
    print('RESULT added to internal group' if r.status_code < 400 else 'RESULT add FAILED')
    sys.exit(0 if r.status_code < 400 else 1)
elif action == 'invite':
    if not testers: print('RESULT not a tester yet - run add first'); sys.exit(0)
    r = call('POST', '/betaTesterInvitations', json={'data': {'type': 'betaTesterInvitations', 'relationships': {
        'app': {'data': {'type': 'apps', 'id': env['ASC_APP_ID']}},
        'betaTester': {'data': {'type': 'betaTesters', 'id': testers[0]['id']}}}}})
    print('RESULT TestFlight invite email sent' if r.status_code < 400 else 'RESULT invite FAILED')
    sys.exit(0 if r.status_code < 400 else 1)
