export interface ProfileStats {
  photos: number;
  hives: number;
  likes: number;
}

export interface ProfileOverview {
  stats: ProfileStats;
  recentPhotos: string[];
}
