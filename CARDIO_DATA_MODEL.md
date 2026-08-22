# Cardio data model

Cardio prescriptions and completed performance remain separate.

## Prescription

- Structure: steady, intervals, circuit, or custom
- Activity and measurement unit
- Planned repetitions, distance or duration per repetition, target pace, and planned rest
- Warm-up and cooldown targets
- Optional goal and training-plan identifiers

## Actual interval repetition

- Stable repetition identifier and sequence
- Actual distance, duration, derived pace, and actual rest
- Optional notes
- Source: manual, Apple Health, Health Connect, Garmin, Fitbit, or imported file
- External workout and sample identifiers for duplicate-safe imports
- Start and end timestamps in UTC, plus captured timezone
- Device and provider metadata
- Raw-source reference for future reconciliation

Each repetition is stored as a work segment followed by a recovery segment.
Passive recovery requires duration; active recovery may also carry activity,
distance, pace, heart rate, and effort. Active-recovery distance contributes to
session distance but never changes the calculated work-interval pace.

Historical actuals are immutable training records. Editing a goal or prescription must never rewrite completed repetitions.
