import Hive from '../models/Hive';
import Sting from '../models/Sting';
import { PublicHive, PublicSting } from '../types/sting';
import { AppError } from '../utils/AppError';
import { toPublicHive, toPublicSting } from '../utils/sting.mapper';
import { syncHiveDocument } from './hive-cleanup.service';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

async function requireActiveHive(id: string): Promise<PublicHive> {
  const hive = await Hive.findById(id);
  if (!hive) {
    throw new AppError(404, 'HIVE_NOT_FOUND', 'Улей не найден или растворился');
  }

  const synced = await syncHiveDocument(hive);
  if (!synced) {
    throw new AppError(404, 'HIVE_NOT_FOUND', 'Улей не найден или растворился');
  }

  return toPublicHive(synced);
}

export async function getHiveById(id: string): Promise<{ hive: PublicHive; stings: PublicSting[] }> {
  const now = new Date();

  const stings = await Sting.find({
    hiveId: id,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1, _id: -1 });

  const hive = await requireActiveHive(id);
  hive.activeStingsCount = stings.length;

  return {
    hive,
    stings: stings.map(toPublicSting),
  };
}

export async function getHiveStings(
  id: string,
  cursor?: string,
  limit?: number,
): Promise<{ stings: PublicSting[]; nextCursor: string | null }> {
  await requireActiveHive(id);

  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  const now = new Date();

  const filter: Record<string, unknown> = {
    hiveId: id,
    expiresAt: { $gt: now },
  };

  if (cursor) {
    const cursorSting = await Sting.findOne({ _id: cursor, hiveId: id });
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

  return {
    stings: page.map(toPublicSting),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
