const E164 = /^\+[1-9]\d{6,14}$/;

export function normalizePhone(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  const raw = String(value).trim().replace(/[\s()-]/g, '');
  if (!raw) {
    return null;
  }

  const normalized = /^8\d{10}$/.test(raw)
    ? `+7${raw.slice(1)}`
    : /^7\d{10}$/.test(raw)
      ? `+${raw}`
      : /^\d{10}$/.test(raw)
        ? `+7${raw}`
        : raw;

  if (!E164.test(normalized)) {
    throw new Error('Телефон должен быть в формате +79990000000');
  }

  return normalized;
}
