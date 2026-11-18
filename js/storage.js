// All data stays in this browser's localStorage. No network calls.
const KEY = 'daysleft.v1';
export const defaults = () => ({ meds: [], settings: { lead: 7 }, card: { name: '', allergies: '', contact: '' } });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw);
    return { ...defaults(), ...d, settings: { ...defaults().settings, ...d.settings }, card: { ...defaults().card, ...d.card } };
  } catch { return defaults(); }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaults();
}
