// Türkiye sabit UTC+3 saat dilimi yardımcıları

export function getIstanbulDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export function shiftDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function getIstanbulWeekStartString(date = new Date()) {
  const todayStr = getIstanbulDateString(date);
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dt.getUTCDay(); // 0 = Pazar, 1 = Pazartesi ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return shiftDateString(todayStr, diffToMonday);
}

export function formatIstanbulTime(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

export function formatIstanbulDateTime(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

export function formatTurkishDateLabel(dateStr) {
  const today = getIstanbulDateString();
  const yesterday = shiftDateString(today, -1);
  const tomorrow = shiftDateString(today, 1);

  if (dateStr === today) return 'Bugün';
  if (dateStr === yesterday) return 'Dün';
  if (dateStr === tomorrow) return 'Yarın';

  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  }).format(dt);
}

// datetime-local girdisini ("2026-11-24T20:00") İstanbul UTC+3 zamanı olarak ISO'ya çevirir
export function istanbulLocalInputToUTC(localStr) {
  if (!localStr) return null;
  return new Date(`${localStr}:00+03:00`).toISOString();
}
