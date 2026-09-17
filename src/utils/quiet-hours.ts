const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 9;

export function hourInTimezone(date: Date, timezone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date);
    const hour = Number.parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

export function isQuietHours(timezone: string, now: Date = new Date()): boolean {
  const hour = hourInTimezone(now, timezone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

export function nextQuietHoursEnd(timezone: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour');

  const local = new Date(Date.UTC(year, month - 1, day, QUIET_END_HOUR, 0, 0));
  if (hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR) {
    return now;
  }
  if (hour >= QUIET_START_HOUR) {
    local.setUTCDate(local.getUTCDate() + 1);
  }

  const utcGuess = new Date(local.getTime());
  const displayedHour = hourInTimezone(utcGuess, timezone);
  const deltaHours = QUIET_END_HOUR - displayedHour;
  return new Date(utcGuess.getTime() + deltaHours * 60 * 60 * 1000);
}
