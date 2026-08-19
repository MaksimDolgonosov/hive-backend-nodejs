import Sting from '../models/Sting';
import { ProfileOverview } from '../types/profile';

export async function getActiveProfileOverview(userId: string): Promise<ProfileOverview> {
  const now = new Date();

  const stings = await Sting.find({
    authorId: userId,
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .select('hiveId reactionsCount thumbnailUrl');

  const hiveIds = new Set<string>();

  let likes = 0;

  for (const sting of stings) {
    likes += sting.reactionsCount;

    if (sting.hiveId) {
      hiveIds.add(String(sting.hiveId));
    }
  }

  return {
    stats: {
      photos: stings.length,
      hives: hiveIds.size,
      likes,
    },
    recentPhotos: stings.slice(0, 4).map((sting) => sting.thumbnailUrl),
  };
}
