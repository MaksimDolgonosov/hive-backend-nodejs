import { PublicHive, PublicSting } from './sting';

export interface ProfileStats {
  photos: number;
  hives: number;
  likes: number;
}

export interface ProfileOverview {
  stats: ProfileStats;
  recentPhotos: string[];
}

export interface StingsPage {
  stings: PublicSting[];
  nextCursor: string | null;
}

export interface UserHiveSummary extends PublicHive {
  userStingsCount: number;
}

export interface UserHivesPage {
  hives: UserHiveSummary[];
  nextCursor: string | null;
}
