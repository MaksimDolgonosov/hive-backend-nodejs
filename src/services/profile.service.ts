import Sting from '../models/Sting';
import User, { IUser } from '../models/User';
import { ProfileOverview } from '../types/profile';
import { PublicProfileUser, PublicUserProfile } from '../types/public-user';
import { AppError } from '../utils/AppError';
import { serializeSocialLinks } from '../utils/social-links';

function toPublicProfileUser(user: IUser): PublicProfileUser {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio ?? null,
    socialLinks: serializeSocialLinks(user.socialLinks),
    createdAt: user.createdAt.toISOString(),
  };
}

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

export async function getPublicUserProfile(userId: string): Promise<PublicUserProfile> {
  const user = await User.findById(userId).select('username avatarUrl bio socialLinks createdAt');
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const overview = await getActiveProfileOverview(userId);

  return {
    user: toPublicProfileUser(user),
    ...overview,
  };
}
