# Forge daily-use beta

This is the safe path for exercising Forge with real accounts before the full public launch.

GitHub Pages publishes a publicly reachable website even when the source repository is private. Forge's sign-in and Supabase row-level security protect account data, but the beta URL itself is not a private staging environment. Use invited testers only and never place exports or server secrets in the site.

## 1. Load another legacy athlete

Do this one athlete at a time so workout data cannot be assigned to the wrong account.

1. Ask the athlete to sign in to Forge once with their own account.
2. In the old Google Apps Script editor, run `listLegacyPeopleForExport()` to see exact names.
3. Run `exportLegacyToDrive('Exact athlete name')`.
4. Download that athlete's JSON export from Google Drive.
5. In Supabase, open Authentication > Users and copy that athlete's user UUID.
6. From the Forge project folder, run:

   ```sh
   npm run import:legacy:guided -- --file /absolute/path/to/forge-athlete-legacy-date.json
   ```

7. Review the dry-run counts. Nothing is written during this first run.
8. If the athlete name, UUID, workout counts, exercises, goals, and split are correct, run:

   ```sh
   npm run import:legacy:guided -- --file /absolute/path/to/forge-athlete-legacy-date.json --commit
   ```

9. Sign in as that athlete and verify Today, History, Goals, Exercises, and Plan before importing the next person.

The importer uses owner-specific database records, defaults to a dry run, prevents duplicate legacy top sets/cardio sessions, and prints a reconciliation report after a committed import.

## 2. Create the GitHub beta

1. Create a new GitHub repository for Forge. Do not add starter files because this project already has them.
2. Initialize this project as the repository and push it to the `main` branch.
3. In the GitHub repository, open Settings > Secrets and variables > Actions and create these repository secrets:

   - `VITE_SUPABASE_URL`: the Forge Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the browser-safe publishable key

4. Never add the Supabase service-role key or OpenAI API key to GitHub. Those remain backend-only Supabase secrets.
5. Open Settings > Pages and set Source to **GitHub Actions**.
6. Push to `main`, or open Actions > Deploy Forge beta to GitHub Pages > Run workflow.
7. The workflow checks the app, creates a production build, and publishes `dist`.

The beta address will look like:

`https://YOUR-GITHUB-NAME.github.io/YOUR-REPOSITORY/`

## 3. Allow sign-in from the beta address

In Supabase, open Authentication > URL Configuration:

- Set Site URL to the exact GitHub Pages beta address while this is the main environment.
- Add the exact beta address to Redirect URLs.
- Keep the localhost redirect you use for development.

Forge uses hash routes, so pages such as `#/history` work under a GitHub project address without server rewrite rules.

## 4. Daily beta routine

- Use separate real user accounts; never share one login.
- Import one athlete, verify their counts and screens, then move to the next athlete.
- Log real workouts through the app instead of editing Supabase rows manually.
- Before each push, run `npm run typecheck` and `npm run build`.
- Push accepted changes to `main`; GitHub publishes the new beta automatically.
- Keep raw athlete exports outside the repository and delete or archive them securely after reconciliation.
- Keep auto-reload off or maintain a strict API budget while testing Coach features.

## Launch gate

Do not treat the beta as the final launch until these pass for every test account:

- Sign-in and sign-out
- Correct next split day after completing a workout
- Multiple recommended and completed top sets
- Cardio distance, duration, and pace
- Editing and deleting mistaken records
- Goals and projections
- Cross-device persistence
- No visibility into another user's records
- Coach answers match the saved daily recommendation
