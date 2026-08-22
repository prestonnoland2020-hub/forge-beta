# Legacy Google Sheets import

This migration is deliberately two-step and defaults to a dry run.

1. Add `LegacyExport.gs` to the old Apps Script project.
2. Run `listLegacyPeopleForExport()` to see the exact athlete names.
3. Run `exportLegacyToDrive('Exact athlete name')`. Download the resulting JSON from Drive. Do not commit athlete exports or service-role keys.
4. Have that athlete sign in to Forge once. This creates their isolated profile and gives them a Supabase Auth user UUID.
5. Apply Supabase migrations through `0010_legacy_library_and_goals.sql`.
6. Run the dry check:

   `npm run import:legacy:guided -- --file /absolute/path/athlete-export.json`

7. Review source counts and warnings. Then repeat with `--commit`.
8. Run the dry check again; source counts stay fixed and a repeated commit imports zero duplicate top sets/cardio sessions. Exercises and goals are merged by their owner/name keys.

Repeat this flow one athlete at a time. The guided importer prints the athlete stored inside the export, asks for that athlete's Forge user UUID, and requires an explicit typed confirmation in commit mode. It refuses to guess when more than one export is present in Downloads/Desktop.

Export version 2 also preserves the legacy lift library, goals, goal mileage boundaries, and authored split snapshot. The imported lift library and goals are loaded by Forge from Supabase; the split snapshot remains in the export for the dedicated split migration.

The browser never receives the service-role key. The import RPC is executable only by the Supabase service role, and raw export files should be deleted or moved to protected storage after reconciliation.
