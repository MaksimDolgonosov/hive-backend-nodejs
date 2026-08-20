export const SOCIAL_LINK_KEYS = ['instagram', 'telegram', 'tiktok', 'youtube', 'website'] as const;

export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

export interface UserSocialLinks {
  instagram: string | null;
  telegram: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
}

export const EMPTY_SOCIAL_LINKS: UserSocialLinks = {
  instagram: null,
  telegram: null,
  tiktok: null,
  youtube: null,
  website: null,
};

export interface UpdateProfileInput {
  bio?: string | null;
  socialLinks?: Partial<UserSocialLinks> | null;
}

export const PROFILE_BIO_MAX_LENGTH = 280;
export const PROFILE_SOCIAL_LINK_MAX_LENGTH = 200;
