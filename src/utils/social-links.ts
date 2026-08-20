import {
  EMPTY_SOCIAL_LINKS,
  PROFILE_SOCIAL_LINK_MAX_LENGTH,
  SOCIAL_LINK_KEYS,
  SocialLinkKey,
  UserSocialLinks,
} from '../types/profile-user';

function trimToNull(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function stripAt(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value;
}

function normalizeWebsite(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function normalizeSocialLink(key: SocialLinkKey, raw: string): string {
  const value = stripAt(raw.trim());

  switch (key) {
    case 'instagram': {
      if (/^https?:\/\//i.test(value)) {
        return value;
      }
      return `https://instagram.com/${value}`;
    }
    case 'telegram': {
      if (/^https?:\/\//i.test(value)) {
        return value;
      }
      return `https://t.me/${value}`;
    }
    case 'tiktok': {
      if (/^https?:\/\//i.test(value)) {
        return value;
      }
      const handle = value.startsWith('@') ? value : `@${value}`;
      return `https://www.tiktok.com/${handle}`;
    }
    case 'youtube': {
      if (/^https?:\/\//i.test(value)) {
        return value;
      }
      if (value.startsWith('@')) {
        return `https://www.youtube.com/${value}`;
      }
      return `https://www.youtube.com/@${value}`;
    }
    case 'website':
      return normalizeWebsite(value);
    default:
      return value;
  }
}

export function normalizeSocialLinks(input: Partial<UserSocialLinks> | null | undefined): UserSocialLinks {
  const normalized: UserSocialLinks = { ...EMPTY_SOCIAL_LINKS };

  for (const key of SOCIAL_LINK_KEYS) {
    const raw = trimToNull(input?.[key], PROFILE_SOCIAL_LINK_MAX_LENGTH);
    normalized[key] = raw ? normalizeSocialLink(key, raw) : null;
  }

  return normalized;
}

export function mergeSocialLinks(
  current: UserSocialLinks | null | undefined,
  patch: Partial<UserSocialLinks> | null | undefined,
): UserSocialLinks {
  if (patch === undefined) {
    return normalizeSocialLinks(current ?? EMPTY_SOCIAL_LINKS);
  }

  if (patch === null) {
    return { ...EMPTY_SOCIAL_LINKS };
  }

  const merged: Partial<UserSocialLinks> = {
    ...(current ?? EMPTY_SOCIAL_LINKS),
    ...patch,
  };

  return normalizeSocialLinks(merged);
}

export function serializeSocialLinks(links: UserSocialLinks | null | undefined): UserSocialLinks {
  return normalizeSocialLinks(links ?? EMPTY_SOCIAL_LINKS);
}
