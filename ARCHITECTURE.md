# Account architecture

## Identity

Supabase Auth owns identity and sessions. Google OAuth is the primary login. The public username is app-owned and stored in profiles; it is not the Google email address. Authenticator-app TOTP is an optional second factor.

## Ownership

Every private data table has an owner_id connected to profiles.id, which is the same UUID as auth.users.id. Row-level security compares owner_id with auth.uid().

## Friendships

friendships stores requester, addressee, state, and explicitly shared metric categories. A unique unordered-pair index prevents duplicate or reversed requests.

Friend comparison should be implemented through a security-reviewed database function that returns only aggregates:

- best true 1RM
- calculated maximum
- workout frequency
- consistency
- cardio totals
- weight trend, only if explicitly shared

It should never grant friends direct SELECT permission on raw workout, top-set, cardio, or body-weight records.

## Profile

The profile stores only data needed for personalization:

- public identity
- units
- height and weight baseline
- age eligibility
- experience
- goal
- equipment
- available training days
- visual brand preferences
- privacy controls

Medical history and sex are intentionally excluded until a validated feature requires them.

## Training split

Splits belong to users, not spreadsheet tabs. training_splits holds the plan, and training_split_days holds ordered days with muscle groups, lifts, and cardio types. The replace_my_training_split function writes a complete new active version.

## Billing

Stripe is the source of truth for payment state. subscriptions is a local entitlement mirror updated only by signed Stripe webhooks using the service role.

The frontend can read its own subscription, but it cannot grant itself Pro access or write Stripe identifiers.

## Migration

The existing sheet names Preston and Adam must be mapped manually to authenticated user UUIDs. Imports should be idempotent and produce a reconciliation report before the new database becomes authoritative.
