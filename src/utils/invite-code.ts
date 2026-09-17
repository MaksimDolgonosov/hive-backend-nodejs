const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

export function generateInviteCode(randomBytes: (size: number) => Buffer): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[ILO]/g, (ch) => {
    if (ch === 'I' || ch === 'L') {
      return '1';
    }
    return '0';
  });
}

export function inviteQuota(acceptedCount: number): number {
  return Math.min(5 + acceptedCount * 2, 25);
}
