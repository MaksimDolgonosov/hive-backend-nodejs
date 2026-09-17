import env from '../config/env';
import AnalyticsEvent from '../models/AnalyticsEvent';
import Sting from '../models/Sting';
import User from '../models/User';
import { Types } from 'mongoose';
import { createTtlCache } from '../utils/cache';
import { AppError } from '../utils/AppError';

const MAX_EVENTS = 50;
const MAX_BODY_BYTES = 64 * 1024;
const metricsCache = createTtlCache<unknown>(5 * 60 * 1000);

const KNOWN_EVENTS = new Set([
  'app_open',
  'session_start',
  'map_empty_shown',
  'empty_cta_tap',
  'nearest_sting_opened',
  'first_sting_published',
  'sting_published',
  'invite_created',
  'invite_accepted',
  'share_opened',
  'push_received',
  'push_opened',
  'campaign_banner_shown',
  'waitlist_submitted',
]);

export async function ingestEvents(input: {
  userId?: string;
  deviceId: string;
  events: Array<{
    name: string;
    occurredAt: string;
    zoneId?: string;
    props?: Record<string, unknown>;
  }>;
  rawSize: number;
}): Promise<void> {
  if (input.rawSize > MAX_BODY_BYTES) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Слишком большое тело запроса');
  }
  if (!input.deviceId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'deviceId обязателен');
  }
  if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > MAX_EVENTS) {
    throw new AppError(422, 'VALIDATION_ERROR', 'events должен содержать от 1 до 50 событий');
  }

  const docs = input.events
    .filter((event) => KNOWN_EVENTS.has(event.name) && event.occurredAt)
    .map((event) => {
      const occurredAt = new Date(event.occurredAt);
      const subject = input.userId || input.deviceId;
      return {
        idempotencyKey: `${subject}:${event.name}:${occurredAt.toISOString()}`,
        userId: input.userId ? new Types.ObjectId(input.userId) : null,
        deviceId: input.deviceId,
        name: event.name,
        occurredAt,
        zoneId: event.zoneId ?? null,
        props: event.props ?? {},
      };
    });

  if (docs.length === 0) {
    return;
  }

  await AnalyticsEvent.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: { idempotencyKey: doc.idempotencyKey },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export async function getDensityMetrics(input: {
  zoneId: string;
  from: Date;
  to: Date;
}): Promise<unknown> {
  const cacheKey = `density:${input.zoneId}:${input.from.toISOString()}:${input.to.toISOString()}`;
  const cached = metricsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sessions = await AnalyticsEvent.find({
    name: 'session_start',
    zoneId: input.zoneId,
    occurredAt: { $gte: input.from, $lte: input.to },
  });

  const densities = sessions.map((event) => {
    const stings = Number(event.props?.stingsInViewport ?? 0);
    const hives = Number(event.props?.hivesInViewport ?? 0);
    return stings + hives;
  });

  const emptySessions = sessions.filter((event) => {
    const stings = Number(event.props?.stingsInViewport ?? 0);
    const hives = Number(event.props?.hivesInViewport ?? 0);
    return stings + hives === 0;
  }).length;

  const userIds = new Set(sessions.map((event) => String(event.userId ?? event.deviceId)));
  const posts = await Sting.countDocuments({
    zoneId: input.zoneId,
    createdAt: { $gte: input.from, $lte: input.to },
  });
  const organicPosts = await Sting.aggregate([
    {
      $match: {
        zoneId: input.zoneId,
        createdAt: { $gte: input.from, $lte: input.to },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'authorId',
        foreignField: '_id',
        as: 'author',
      },
    },
    { $unwind: '$author' },
    { $match: { 'author.accountType': 'personal' } },
    { $count: 'count' },
  ]);

  const result = {
    zoneId: input.zoneId,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    viewportDensityMedian: median(densities),
    emptySessionRate: sessions.length === 0 ? null : emptySessions / sessions.length,
    zoneDau: userIds.size,
    postsPerActiveUser: userIds.size === 0 ? null : posts / userIds.size,
    organic: {
      posts: organicPosts[0]?.count ?? 0,
      postsPerActiveUser: userIds.size === 0 ? null : (organicPosts[0]?.count ?? 0) / userIds.size,
    },
  };

  metricsCache.set(cacheKey, result);
  return result;
}

export async function getRetentionMetrics(input: {
  zoneId: string;
  cohort: string;
}): Promise<unknown> {
  const cacheKey = `retention:${input.zoneId}:${input.cohort}`;
  const cached = metricsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const cohortStart = new Date(input.cohort);
  const cohortEnd = new Date(cohortStart.getTime() + 24 * 60 * 60 * 1000);

  const firstSessions = await AnalyticsEvent.find({
    name: 'session_start',
    zoneId: input.zoneId,
    occurredAt: { $gte: cohortStart, $lt: cohortEnd },
  });

  const users = new Set(
    firstSessions
      .map((event) => (event.userId ? String(event.userId) : null))
      .filter((id): id is string => Boolean(id)),
  );

  async function retainedAfter(days: number): Promise<number> {
    if (users.size === 0) {
      return 0;
    }
    const from = new Date(cohortStart.getTime() + days * 24 * 60 * 60 * 1000);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const returned = await AnalyticsEvent.distinct('userId', {
      name: 'session_start',
      zoneId: input.zoneId,
      userId: { $in: [...users] },
      occurredAt: { $gte: from, $lt: to },
    });
    return returned.length / users.size;
  }

  const result = {
    zoneId: input.zoneId,
    cohort: cohortStart.toISOString(),
    size: users.size,
    d1: await retainedAfter(1),
    d7: await retainedAfter(7),
    d30: await retainedAfter(30),
  };

  metricsCache.set(cacheKey, result);
  return result;
}

export async function getGrowthMetrics(input: { from: Date; to: Date }): Promise<unknown> {
  const cacheKey = `growth:${input.from.toISOString()}:${input.to.toISOString()}`;
  const cached = metricsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [invitesCreated, invitesAccepted, sharesOpened, newUsers] = await Promise.all([
    AnalyticsEvent.countDocuments({
      name: 'invite_created',
      occurredAt: { $gte: input.from, $lte: input.to },
    }),
    AnalyticsEvent.countDocuments({
      name: 'invite_accepted',
      occurredAt: { $gte: input.from, $lte: input.to },
    }),
    AnalyticsEvent.countDocuments({
      name: 'share_opened',
      occurredAt: { $gte: input.from, $lte: input.to },
    }),
    User.countDocuments({ createdAt: { $gte: input.from, $lte: input.to } }),
  ]);

  const inviters = await AnalyticsEvent.distinct('userId', {
    name: 'invite_created',
    occurredAt: { $gte: input.from, $lte: input.to },
  });

  const result = {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    invitesCreated,
    invitesAccepted,
    kFactor: inviters.filter(Boolean).length === 0
      ? 0
      : invitesAccepted / inviters.filter(Boolean).length,
    sharesOpened,
    newUsers,
  };

  metricsCache.set(cacheKey, result);
  return result;
}
