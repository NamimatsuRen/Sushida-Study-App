import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityDateKey, addStudyActivity, restoreStudyActivity, validStudyActivity, studyActivityView, renderStudyActivity } from '../dist/activity.js';
const now = new Date(2026, 10, 5, 12).getTime();
const ago = days => { const date = new Date(now); date.setDate(date.getDate() - days); return date.getTime(); };
const event = (outcome, days = 0, kind = 'new') => ({ outcome, at: ago(days), kind });
const total = (attempts, correct = attempts, assisted = 0, forgot = 0) => ({ attempts, correct, assisted, forgot });

test('activity counts actual responses, including assisted answers, retries and timeouts', () => {
  const logs = [event('recalled'), event('assisted'), event('forgot', 0, 'retry'), event('recalled', 0, 'extra')];
  const daily = restoreStudyActivity(null, logs);
  assert.deepEqual(daily[activityDateKey(now)], total(4, 2, 1, 1));
  assert.equal(studyActivityView(daily, now).today.attempts, 4);
});
test('legacy logs backfill once and a saved aggregate is not added to its logs again', () => {
  const logs = [event('recalled'), event('assisted')];
  const migrated = restoreStudyActivity(undefined, logs);
  assert.deepEqual(restoreStudyActivity(migrated, logs), migrated);
  const next = addStudyActivity(migrated, event('forgot'));
  assert.equal(restoreStudyActivity(next, [...logs, event('forgot')])[activityDateKey(now)].attempts, 3);
});
test('daily totals survive a rolling log window and preserve older dates', () => {
  const stored = { [activityDateKey(ago(40))]: total(3000), [activityDateKey(now)]: total(50) };
  const restored = restoreStudyActivity(stored, [event('recalled')]);
  const next = addStudyActivity(restored, event('recalled'));
  assert.equal(next[activityDateKey(ago(40))].attempts, 3000);
  assert.equal(next[activityDateKey(now)].attempts, 51);
});
test('calendar is Sunday-aligned across year boundaries and excludes future days', () => {
  const date = new Date(2027, 0, 1, 12).getTime();
  const view = studyActivityView({}, date);
  assert.equal(view.weeks.length, 13); assert.ok(view.weeks.every(week => week.length === 7));
  assert.equal(new Date(view.weeks[0][0].key + 'T12:00:00').getDay(), 0);
  assert.equal(view.weeks.at(-1)[5].key, '2027-01-01');
  assert.equal(view.weeks.at(-1)[6].future, true);
  assert.equal(view.recent[0].key, '2027-01-01');
});
test('consecutive days continue from yesterday until today is played and break on a missing day', () => {
  const yesterday = restoreStudyActivity(null, [event('recalled', 1), event('forgot', 2)]);
  assert.equal(studyActivityView(yesterday, now).streak, 2);
  assert.equal(studyActivityView(yesterday, now).streakIncludesToday, false);
  assert.equal(studyActivityView(addStudyActivity(yesterday, event('recalled')), now).streak, 3);
  assert.equal(studyActivityView(restoreStudyActivity(null, [event('recalled', 2)]), now).streak, 0);
});
test('invalid dates, negative counts and inconsistent totals are excluded safely', () => {
  const valid = { [activityDateKey(now)]: total(3) };
  const corrupt = { ...valid, '2026-02-30': total(2), '2026-13-01': total(1), '2026-11-01': total(-1), '2026-11-02': total(5, 1), invalid: total(2) };
  assert.deepEqual(validStudyActivity(corrupt), valid);
  assert.deepEqual(restoreStudyActivity({ invalid: total(2) }, [event('recalled')]), { [activityDateKey(now)]: total(1) });
});
test('a new local calendar day has its own total, and a new calendar year keeps previous counts', () => {
  const before = new Date(2026, 11, 31, 23, 59).getTime(), after = new Date(2027, 0, 1, 0, 1).getTime();
  const first = addStudyActivity({}, { outcome: 'recalled', at: before });
  const next = addStudyActivity(first, { outcome: 'assisted', at: after });
  assert.equal(next['2026-12-31'].attempts, 1); assert.equal(next['2027-01-01'].attempts, 1);
  assert.equal(studyActivityView(next, after).streak, 2);
});
test('color intensity and accessible summaries represent real activity without empty-state examples', () => {
  const days = { [activityDateKey(now)]: total(30), [activityDateKey(ago(1))]: total(15), [activityDateKey(ago(2))]: total(5), [activityDateKey(ago(3))]: total(1) };
  const view = studyActivityView(days, now);
  assert.deepEqual(view.recent.slice(0, 4).map(day => day.level), [4, 3, 2, 1]);
  const html = renderStudyActivity(days, now); assert.match(html, /4日、51回の挑戦/); assert.match(html, /<table>/); assert.match(html, /2026-11-05/);
  const empty = renderStudyActivity({}, now); assert.match(empty, /0日、0回の挑戦/); assert.doesNotMatch(empty, /class="activity-level-[1-4] activity-is-today/);
});
