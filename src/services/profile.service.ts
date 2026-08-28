import { Types } from 'mongoose';

import Hive from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import StingReaction from '../models/StingReaction';
import User, { IUser } from '../models/User';
import { ProfileOverview, StingsPage, UserHiveSummary, UserHivesPage } from '../types/profile';
import { PublicProfileUser, PublicUserProfile } from '../types/public-user';
import { AppError } from '../utils/AppError';
import { serializeSocialLinks } from '../utils/social-links';
import { mapPublicStings, toPublicHive } from '../utils/sting.mapper';
import { getLikedStingIds } from './reactions.service';
import { syncHiveDocument } from './hive-cleanup.service';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

function normalizePageLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
}

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

export async function getMyStings(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<StingsPage> {
  const pageLimit = normalizePageLimit(limit);
  const now = new Date();

  const filter: Record<string, unknown> = {
    authorId: userId,
    expiresAt: { $gt: now },
  };

  if (cursor) {
    const cursorSting = await Sting.findOne({ _id: cursor, authorId: userId });
    if (!cursorSting) {
      throw new AppError(422, 'INVALID_CURSOR', 'Некорректный cursor');
    }

    filter.$or = [
      { createdAt: { $lt: cursorSting.createdAt } },
      { createdAt: cursorSting.createdAt, _id: { $lt: cursorSting._id } },
    ];
  }

  const items = await Sting.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageLimit + 1);

  const hasMore = items.length > pageLimit;
  const page = hasMore ? items.slice(0, pageLimit) : items;

  const likedStingIds = await getLikedStingIds(
    userId,
    page.map((sting) => sting.id),
  );

  return {
    stings: await mapPublicStings(page, likedStingIds),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

type HiveGroupRow = {
  _id: Types.ObjectId;
  userStingsCount: number;
  latestCreatedAt: Date;
};

export async function getMyHives(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<UserHivesPage> {
  const pageLimit = normalizePageLimit(limit);
  const now = new Date();

  const matchStage: Record<string, unknown> = {
    authorId: new Types.ObjectId(userId),
    expiresAt: { $gt: now },
    hiveId: { $ne: null },
  };

  const postGroupMatch: Record<string, unknown> = {};

  if (cursor) {
    const cursorSting = await Sting.findOne({
      authorId: userId,
      hiveId: cursor,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1, _id: -1 });

    if (!cursorSting) {
      throw new AppError(422, 'INVALID_CURSOR', 'Некорректный cursor');
    }

    postGroupMatch.$or = [
      { latestCreatedAt: { $lt: cursorSting.createdAt } },
      {
        latestCreatedAt: cursorSting.createdAt,
        _id: { $lt: new Types.ObjectId(cursor) },
      },
    ];
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$hiveId',
        userStingsCount: { $sum: 1 },
        latestCreatedAt: { $max: '$createdAt' },
      },
    },
    ...(Object.keys(postGroupMatch).length > 0 ? [{ $match: postGroupMatch }] : []),
    { $sort: { latestCreatedAt: -1 as const, _id: -1 as const } },
    { $limit: pageLimit + 1 },
  ];

  const rows = await Sting.aggregate<HiveGroupRow>(pipeline);
  const hasMore = rows.length > pageLimit;
  const page = hasMore ? rows.slice(0, pageLimit) : rows;

  const hives: UserHiveSummary[] = [];

  for (const row of page) {
    const hive = await Hive.findById(row._id);
    if (!hive) {
      continue;
    }

    const synced = await syncHiveDocument(hive);
    if (!synced) {
      continue;
    }

    hives.push({
      ...toPublicHive(synced),
      userStingsCount: row.userStingsCount,
    });
  }

  return {
    hives,
    nextCursor: hasMore && page.length > 0 ? String(page[page.length - 1]._id) : null,
  };
}

export async function getLikedStings(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<StingsPage> {
  const pageLimit = normalizePageLimit(limit);
  const now = new Date();

  const filter: Record<string, unknown> = {
    userId,
    expiresAt: { $gt: now },
  };

  if (cursor) {
    const cursorReaction = await StingReaction.findOne({ userId, stingId: cursor });
    if (!cursorReaction) {
      throw new AppError(422, 'INVALID_CURSOR', 'Некорректный cursor');
    }

    filter.$or = [
      { createdAt: { $lt: cursorReaction.createdAt } },
      { createdAt: cursorReaction.createdAt, _id: { $lt: cursorReaction._id } },
    ];
  }

  const reactions = await StingReaction.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageLimit + 1);

  const hasMore = reactions.length > pageLimit;
  const pageReactions = hasMore ? reactions.slice(0, pageLimit) : reactions;

  const stingIds = pageReactions.map((reaction) => reaction.stingId);
  const stings = await Sting.find({
    _id: { $in: stingIds },
    expiresAt: { $gt: now },
  });

  const stingById = new Map(stings.map((sting) => [sting.id, sting]));
  const orderedStings: ISting[] = [];

  for (const reaction of pageReactions) {
    const sting = stingById.get(String(reaction.stingId));
    if (sting) {
      orderedStings.push(sting);
    }
  }

  const likedStingIds = new Set(orderedStings.map((sting) => sting.id));

  return {
    stings: await mapPublicStings(orderedStings, likedStingIds),
    nextCursor:
      hasMore && pageReactions.length > 0
        ? String(pageReactions[pageReactions.length - 1].stingId)
        : null,
  };
}
