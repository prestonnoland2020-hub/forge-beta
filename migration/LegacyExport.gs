/**
 * Add this file to the legacy Apps Script project temporarily, then call
 * exportLegacyToDrive('Exact athlete name') from the editor.
 * Copy the returned JSON into a UTF-8 file. This function never writes Sheets.
 */
function exportLegacyTrainingBundle(personName) {
  if (getPeopleNames_().indexOf(personName) === -1) throw new Error('Unknown person: ' + personName);
  var tz = Session.getScriptTimeZone();
  var daySheet = getSheet_(personName);
  var dayRows = daySheet.getDataRange().getValues();
  var days = [];
  for (var i = 1; i < dayRows.length; i++) {
    var row = dayRows[i];
    if (!(row[3] instanceof Date) || isNaN(row[3].getTime())) continue;
    if (!(row[4] || row[5] || row[6] || row[7] || row[8] || row[9])) continue;
    var muscles = String(row[4] || '').split(',').map(function(value) { return value.trim(); }).filter(Boolean);
    var cardio = String(row[6] || '').split(',').map(function(value) { return value.trim(); }).filter(Boolean);
    days.push({
      date: Utilities.formatDate(row[3], tz, 'yyyy-MM-dd'),
      title: muscles.length ? muscles.join(' + ') : cardio.length ? cardio.join(' + ') : 'Imported training day',
      muscles: muscles.concat(cardio.length ? ['Cardio'] : []).filter(function(value,index,all) { return all.indexOf(value) === index; }),
      notes: [row[5], row[7]].filter(Boolean).join('\n'),
      bodyWeight: typeof row[9] === 'number' ? row[9] : null,
      simpleCardio: cardio.length ? { activities: cardio, miles: typeof row[8] === 'number' ? row[8] : null, minutes: typeof row[10] === 'number' ? row[10] : null, notes: row[7] || '' } : null,
      sourceRow: personName + ':' + (i + 1)
    });
  }
  var topSets = getPRs(personName).map(function(pr,index) {
    return { date: Utilities.formatDate(new Date(pr.dateSortable), tz, 'yyyy-MM-dd'), lift: pr.lift, muscle: 'Primary', weight: pr.weight, reps: pr.reps || 1, position: index + 1, sourceRow: String(pr.rowIndex) };
  });
  var detailedCardio = getCardioLog(personName).map(function(session) {
    var activities = session.cardioTypes || [];
    var distance = session.intervals.reduce(function(sum,line) { return sum + (Number(line.distance) || 0); }, 0);
    var minutes = session.intervals.reduce(function(sum,line) { return sum + (Number(line.time) || 0); }, 0);
    var structure = session.intervals.some(function(line) { return Number(line.rounds) > 0 || line.circuitGroup; }) ? 'circuit' : session.intervals.length > 1 ? 'intervals' : 'custom';
    return { date: Utilities.formatDate(new Date(session.dateSortable), tz, 'yyyy-MM-dd'), sourceId: String(session.sessionId), structure: structure, activity: activities.join(' + ') || 'Cardio', summary: [activities.join(' + '), distance ? distance + ' total distance' : '', minutes ? minutes + ' min' : ''].filter(Boolean).join(' · '), notes: session.notes || '', draft: { id: String(session.sessionId), structure: structure, activity: activities.join(' + ') || 'Cardio', summary: session.notes || activities.join(' + '), prescription: { legacyIntervals: session.intervals } } };
  });
  var detailedDates = {};
  detailedCardio.forEach(function(session) { detailedDates[session.date] = true; });
  var simpleCardio = days.filter(function(day) { return day.simpleCardio && !detailedDates[day.date]; }).map(function(day) { var item=day.simpleCardio;return { date: day.date, sourceId: 'day-' + day.sourceRow, structure: 'steady', activity: item.activities.join(' + '), summary: [item.miles ? item.miles + ' mi' : '', item.minutes ? item.minutes + ' min' : '', item.notes].filter(Boolean).join(' · '), notes: item.notes, draft: { id: 'day-' + day.sourceRow, structure: 'steady', activity: item.activities.join(' + '), summary: item.notes || item.activities.join(' + '), prescription: { distance: item.miles || '', distanceUnit: 'miles', duration: item.minutes || '' } } }; });
  var goals = (getGoal(personName).goals || []).map(function(goal,index) {
    return { sourceId: personName + ':goal:' + (index + 1), type: goal.type, name: goal.name, value: Number(goal.value), muscleGroup: goal.muscleGroup || '', targetDate: goal.targetDate || '', minWeeklyMileage: goal.minWeeklyMileage == null ? null : Number(goal.minWeeklyMileage), peakWeeklyMileage: goal.peakWeeklyMileage == null ? null : Number(goal.peakWeeklyMileage) };
  });
  var split = getSplitPlan(personName);
  var muscleByLift = {};
  goals.forEach(function(goal) { if (goal.type === 'lift' && goal.muscleGroup) muscleByLift[String(goal.name).toLowerCase()] = [goal.muscleGroup]; });
  (split.days || []).forEach(function(day) { (day.goalLifts || []).forEach(function(lift) { var key=String(lift).toLowerCase();muscleByLift[key]=(muscleByLift[key]||[]).concat(day.muscleGroups||[]).filter(function(value,index,all){return all.indexOf(value)===index;}); }); });
  var exercises = getListValues_('Lifts', DEFAULT_LIFTS).map(function(name,index) { return { sourceId: personName + ':exercise:' + (index + 1), name: name, kind: 'Strength', muscles: muscleByLift[String(name).toLowerCase()] || [], enabled: true }; });
  return JSON.stringify({ version: 'forge-legacy-export-v2', exportedAt: new Date().toISOString(), timezone: tz, person: personName, days: days.map(function(day) { delete day.simpleCardio; return day; }), topSets: topSets, cardioSessions: detailedCardio.concat(simpleCardio), exercises: exercises, goals: goals, split: split });
}

/**
 * Lists the exact athlete names that can be exported. This is useful before
 * running exportLegacyToDrive so a misspelling cannot select the wrong sheet.
 */
function listLegacyPeopleForExport() {
  var people = getPeopleNames_();
  console.log('LEGACY_PEOPLE=' + people.join(' | '));
  return people;
}

/**
 * Creates one private JSON export for one athlete in the current user's Google
 * Drive. It never edits, clears, or deletes spreadsheet data.
 */
function exportLegacyToDrive(personName) {
  var cleanName = String(personName || '').trim();
  if (!cleanName) throw new Error('Enter the exact athlete name shown by listLegacyPeopleForExport().');
  var json = exportLegacyTrainingBundle(cleanName);
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  var slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'athlete';
  var file = DriveApp.createFile('forge-' + slug + '-legacy-' + timestamp + '.json', json, MimeType.PLAIN_TEXT);
  console.log('EXPORT_FILE_URL=' + file.getUrl());
  console.log('EXPORT_FILE_NAME=' + file.getName());
  console.log('EXPORT_PERSON=' + cleanName);
  return file.getUrl();
}

/**
 * Kept so the existing Preston export button/instructions still work.
 */
function exportPrestonLegacyToDrive() {
  return exportLegacyToDrive('Preston');
}
