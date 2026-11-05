// Activity is based on answered questions, including retries and timeouts.
// Calendar dates use this device's local time, not UTC slices.
export const ACTIVITY_WEEKS = 13;
export function activityDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const emptyActivityDay = () => ({ attempts: 0, correct: 0, assisted: 0, forgot: 0 });
export function validStudyActivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, day]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key) && activityDateKey(`${key}T12:00:00`) === key && day &&
    ['attempts', 'correct', 'assisted', 'forgot'].every(field => Number.isSafeInteger(day[field]) && day[field] >= 0) &&
    day.attempts === day.correct + day.assisted + day.forgot));
}
export function addStudyActivity(activity, event, at = event.at) {
  const key = activityDateKey(at);
  const field = { recalled: 'correct', assisted: 'assisted', forgot: 'forgot' }[event.outcome];
  if (!key || !field) return activity;
  const previous = activity[key] || emptyActivityDay();
  return { ...activity, [key]: { ...previous, attempts: previous.attempts + 1, [field]: previous[field] + 1 } };
}
export function restoreStudyActivity(stored, logs) {
  const validated = validStudyActivity(stored);
  // Once a daily aggregate exists, never add its source logs again on reload.
  if (Object.keys(validated).length || !logs.length) return validated;
  return logs.reduce((days, event) => addStudyActivity(days, event), {});
}
export function studyActivityView(activity, now = Date.now()) {
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const todayKey = activityDateKey(today);
  const start = new Date(today); start.setDate(start.getDate() - start.getDay() - (ACTIVITY_WEEKS - 1) * 7);
  const weeks = Array.from({ length: ACTIVITY_WEEKS }, (_, week) => Array.from({ length: 7 }, (_, weekday) => {
    const date = new Date(start); date.setDate(date.getDate() + week * 7 + weekday);
    const key = activityDateKey(date), future = date > today;
    const counts = activity[key] || emptyActivityDay();
    const level = future || !counts.attempts ? 0 : counts.attempts < 5 ? 1 : counts.attempts < 15 ? 2 : counts.attempts < 30 ? 3 : 4;
    return { key, month: date.getMonth() + 1, day: date.getDate(), future, level, ...counts };
  }));
  const visible = weeks.flat().filter(day => !day.future);
  const todayCounts = activity[todayKey] || emptyActivityDay();
  const cursor = new Date(today);
  if (!todayCounts.attempts) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activity[activityDateKey(cursor)]?.attempts > 0) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { weeks, todayKey, today: todayCounts, streak, streakIncludesToday: todayCounts.attempts > 0,
    activeDays: visible.filter(day => day.attempts > 0).length,
    total: visible.reduce((sum, day) => sum + day.attempts, 0), recent: visible.slice(-7).reverse() };
}
export function renderStudyActivity(activity, now = Date.now()) {
  const view = studyActivityView(activity, now);
  const number = value => value.toLocaleString('ja-JP');
  const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const monthLabels = view.weeks.map((week, i) => i === 0 || week[0].month !== view.weeks[i - 1][0].month ? `<text x="${32 + i * 24}" y="16">${week[0].month}月</text>` : '').join('');
  const cells = view.weeks.map((week, x) => week.map((day, y) => day.future ? '' : `<rect class="activity-level-${day.level}${day.key === view.todayKey ? ' activity-is-today' : ''}" x="${32 + x * 24}" y="${32 + y * 24}" width="16" height="16" rx="4"><title>${day.key}：${day.attempts}回の挑戦（追加ヒントなし${day.correct}回・ヒントあり${day.assisted}回・学び直し${day.forgot}回）</title></rect>`).join('')).join('');
  return `<section class="activity-panel" aria-label="学習カレンダー"><div class="activity-heading"><div><span class="activity-eyebrow">YOUR DAILY PRACTICE</span><h2>毎日の積み重ね</h2></div><span class="activity-period">直近13週間</span></div>
    <div class="activity-today"><div><span>今日の挑戦</span><strong data-activity-today>${number(view.today.attempts)}<small>回</small></strong></div><div><span>追加ヒントなし</span><strong>${number(view.today.correct)}<small>回</small></strong></div><div><span>${view.streakIncludesToday ? '今日まで' : '昨日まで'}の連続</span><strong>${view.streak}<small>日</small></strong></div></div>
    <div class="activity-calendar"><svg viewBox="0 0 352 200" role="img" aria-label="直近13週間で${view.activeDays}日、${view.total}回の挑戦。今日${view.today.attempts}回。色が濃いほど挑戦した回数が多い日です。">${monthLabels}${weekdayNames.map((name, i) => `<text x="8" y="${44 + i * 24}">${name}</text>`).join('')}${cells}</svg></div>
    <div class="activity-bottom"><span>${view.activeDays ? `この期間に${view.activeDays}日・${number(view.total)}回の挑戦` : '1問取り組むと、このカレンダーに色が付きます。'}</span><span class="activity-legend" aria-label="1〜4回、5〜14回、15〜29回、30回以上の順に濃く表示">少ない ${[0, 1, 2, 3, 4].map(level => `<i class="activity-level-${level}"></i>`).join('')} 多い</span></div>
    <details class="activity-recent"><summary>直近7日の日別記録を見る</summary><table><caption class="sr-only">日ごとの挑戦数と追加ヒントなしの完答数</caption><thead><tr><th scope="col">日付</th><th scope="col">挑戦</th><th scope="col">追加ヒントなし</th></tr></thead><tbody>${view.recent.map(day => `<tr><th scope="row">${day.key}</th><td>${number(day.attempts)}回</td><td>${number(day.correct)}回</td></tr>`).join('')}</tbody></table></details>
    <p class="activity-note">周回・ヒント付き・時間切れも挑戦に含みます。この端末の日付で集計します。保存状況は画面下で確認できます。</p></section>`;
}
