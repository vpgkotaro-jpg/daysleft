// Days-left math. Pure functions; dates are local "YYYY-MM-DD" strings so tests are deterministic.

export function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a, b) { // b - a in whole days
  const t = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

export const unitsPerDay = (dose, timesPerDay) => +(dose * timesPerDay).toFixed(6);

/** Whole days of supply left: floor(onHand / perDay). Returns null if perDay is not positive. */
export function daysLeft(onHand, perDay) {
  if (!(perDay > 0) || !(onHand >= 0)) return null;
  // small epsilon so 3 / (1/3) style float noise does not lose a day
  return Math.floor(onHand / perDay + 1e-9);
}

/**
 * The last calendar day that is still fully covered, or null when already out.
 * If today's dose is already taken, the remaining supply starts tomorrow.
 */
export function lastCoveredDate(med, today) {
  const d = daysLeft(med.onHand, med.perDay);
  if (d === null || d < 1) return null;
  const start = med.lastTaken === today ? addDays(today, 1) : today;
  return addDays(start, d - 1);
}

/** 'out' (0 days), 'soon' (<= lead days), 'ok'. */
export function status(days, lead) {
  if (days === null) return 'unknown';
  if (days < 1) return 'out';
  return days <= lead ? 'soon' : 'ok';
}

export function enrich(med, today, lead) {
  const days = daysLeft(med.onHand, med.perDay);
  return { ...med, days, lastCovered: lastCoveredDate(med, today), status: status(days, lead) };
}

/** Sorted ascending by days left; unknown last; ties by name. */
export function sortMeds(meds, today, lead) {
  return meds.map(m => enrich(m, today, lead)).sort((a, b) => {
    const da = a.days === null ? Infinity : a.days, db = b.days === null ? Infinity : b.days;
    return da - db || a.name.localeCompare(b.name);
  });
}

export function headline(sorted, lead) {
  const first = sorted.find(m => m.days !== null);
  if (!first) return { text: sorted.length ? 'Set a daily amount to see days left' : 'Add a medicine to see how long your supply lasts', level: 'empty', med: null };
  if (first.days < 1) return { text: `${first.name} has run out`, level: 'out', med: first };
  const unit = first.days === 1 ? 'day' : 'days';
  return {
    text: `${first.days} ${unit} until your first medicine runs out`,
    level: first.days <= lead ? 'soon' : 'ok',
    med: first,
  };
}

/** "I took today's dose": subtract one day of units once per calendar day. */
export function takeToday(med, today) {
  if (med.lastTaken === today) return med;
  return { ...med, onHand: Math.max(0, +(med.onHand - med.perDay).toFixed(6)), lastTaken: today, countedOn: today };
}
