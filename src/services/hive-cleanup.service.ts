import mongoose, { Types } from 'mongoose';
import {
  emitHiveDissolved,
  emitHiveUpdated,
  emitStingExpired,
} from '../sockets/realtime';
import env from '../config/env';
import Hive, { IHive } from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import { deleteStingImages } from './storage.service';
import { coordinatesToGeoPoint } from '../utils/geo';
import { toPublicHive } from '../utils/sting.mapper';
import { refreshHiveFromStings } from './clustering.service';
import { recordEchoForExpiredSting } from './echoes.service';
import User from '../models/User';
import { PublicContributor } from '../types/growth';

let changeStreamsActive = false;
let periodicCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function areChangeStreamsActive(): boolean {
  return changeStreamsActive;
}

async function hiveWithContributors(hive: IHive) {
  const now = new Date();
  const stings = await Sting.find({
    hiveId: hive._id,
    expiresAt: { $gt: now },
    mediaPurgedAt: null,
  })
    .sort({ createdAt: -1 })
    .select('authorId');

  const authorIds: string[] = [];
  for (const sting of stings) {
    const id = String(sting.authorId);
    if (!authorIds.includes(id)) {
      authorIds.push(id);
    }
  }
  const users = await User.find({ _id: { $in: authorIds.slice(0, 5) } }).select('username avatarUrl');
  const authors = new Map(users.map((user) => [user.id, user]));
  const topContributors: PublicContributor[] = authorIds.slice(0, 5).map((authorId) => {
    const author = authors.get(authorId);
    return {
      userId: authorId,
      username: author?.username ?? 'User',
      avatarUrl: author?.avatarUrl ?? null,
    };
  });
  return toPublicHive(hive, topContributors);
}

export async function syncHiveDocument(
  hive: IHive,
  now: Date = new Date(),
): Promise<IHive | null> {
  const activeStings = await Sting.find({
    hiveId: hive._id,
    expiresAt: { $gt: now },
    mediaPurgedAt: null,
  }).select('_id');

  if (activeStings.length <= 1) {
    const center = coordinatesToGeoPoint(hive.center.coordinates);
    if (activeStings.length === 1) {
      await Sting.updateMany(
        { hiveId: hive._id, expiresAt: { $gt: now } },
        { $set: { hiveId: null } },
      );
    }
    await hive.deleteOne();
    emitHiveDissolved(String(hive._id), center.lat, center.lng);
    return null;
  }

  const previousStage = hive.stage;
  const previousCount = hive.activeStingsCount;
  const previousActivation = hive.activationCount;
  await refreshHiveFromStings(hive, now);

  if (
    hive.stage !== previousStage ||
    hive.activeStingsCount !== previousCount ||
    hive.activationCount !== previousActivation
  ) {
    emitHiveUpdated(await hiveWithContributors(hive));
  }

  return hive;
}

export async function handleStingRemoved(
  hiveId: Types.ObjectId,
): Promise<'dissolved' | 'updated' | 'missing'> {
  const hive = await Hive.findById(hiveId);
  if (!hive) {
    return 'missing';
  }

  const synced = await syncHiveDocument(hive);
  if (!synced) {
    return 'dissolved';
  }

  return 'updated';
}

export async function notifyStingRemoved(
  stingId: string,
  hiveId: Types.ObjectId | null | undefined,
  lat: number,
  lng: number,
): Promise<void> {
  emitStingExpired(stingId, hiveId ? String(hiveId) : null, lat, lng);

  if (!hiveId) {
    return;
  }

  await handleStingRemoved(hiveId);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function purgeExpiredSting(sting: ISting, now: Date): Promise<void> {
  const imageUrl = sting.imageUrl;
  const thumbnailUrl = sting.thumbnailUrl;
  const [lng, lat] = sting.location.coordinates;

  const result = await Sting.updateOne(
    { _id: sting._id, mediaPurgedAt: null },
    {
      $set: {
        mediaPurgedAt: now,
        imageUrl: '',
        thumbnailUrl: '',
      },
    },
  );

  if (result.matchedCount === 0) {
    return;
  }

  if (imageUrl && thumbnailUrl) {
    try {
      await deleteStingImages(imageUrl, thumbnailUrl);
    } catch (err: unknown) {
      console.warn(`Не удалось удалить медиа жала ${sting.id}:`, errorMessage(err));
    }
  }

  if (sting.expiresAt <= now) {
    await recordEchoForExpiredSting(sting);
  }

  await notifyStingRemoved(sting.id, sting.hiveId, lat, lng);
}

export async function reconcileHives(): Promise<void> {
  const now = new Date();
  const hives = await Hive.find();
  await Promise.all(hives.map((hive) => syncHiveDocument(hive, now)));
}

async function cleanupExpiredStings(): Promise<void> {
  const now = new Date();
  const expiredStings = await Sting.find({
    expiresAt: { $lte: now },
    mediaPurgedAt: null,
  }).limit(200);

  for (const sting of expiredStings) {
    try {
      await purgeExpiredSting(sting, now);
    } catch (err: unknown) {
      console.warn(`Ошибка очистки истёкшего жала ${sting.id}:`, errorMessage(err));
    }
  }
}

async function enablePreImages(): Promise<void> {
  if (!mongoose.connection.db) {
    return;
  }

  try {
    await mongoose.connection.db.command({
      collMod: 'stings',
      changeStreamPreAndPostImages: { enabled: true },
    });
  } catch {
    // Коллекция может ещё не существовать
  }
}

async function isReplicaSetAvailable(): Promise<boolean> {
  if (!mongoose.connection.db) {
    return false;
  }

  try {
    const status = await mongoose.connection.db.admin().command({ replSetGetStatus: 1 });
    return status.ok === 1;
  } catch {
    return false;
  }
}

function startPeriodicHiveCleanup(): void {
  if (periodicCleanupTimer) {
    return;
  }

  void reconcileHives().catch((err: unknown) => {
    console.warn('Ошибка периодической очистки ульев:', errorMessage(err));
  });
  void cleanupExpiredStings().catch((err: unknown) => {
    console.warn('Ошибка очистки истёкших жал:', errorMessage(err));
  });

  periodicCleanupTimer = setInterval(() => {
    void reconcileHives().catch((err: unknown) => {
      console.warn('Ошибка периодической очистки ульев:', errorMessage(err));
    });
    void cleanupExpiredStings().catch((err: unknown) => {
      console.warn('Ошибка очистки истёкших жал:', errorMessage(err));
    });
  }, env.hiveCleanupIntervalMs);

  console.log(
    `Периодическая синхронизация ульев: каждые ${env.hiveCleanupIntervalMs / 1000}с`,
  );
}

export async function startStingDeletionWatcher(): Promise<void> {
  changeStreamsActive = false;

  startPeriodicHiveCleanup();

  if (!(await isReplicaSetAvailable())) {
    return;
  }

  await enablePreImages();

  const stream = Sting.watch([{ $match: { operationType: 'delete' } }], {
    fullDocumentBeforeChange: 'whenAvailable',
  });

  stream.on('change', (change) => {
    void (async () => {
      const doc = change.fullDocumentBeforeChange;
      if (!doc?.location?.coordinates) {
        return;
      }

      if (doc.imageUrl && doc.thumbnailUrl) {
        await deleteStingImages(doc.imageUrl, doc.thumbnailUrl);
      }

      const [lng, lat] = doc.location.coordinates;
      await notifyStingRemoved(String(doc._id), doc.hiveId, lat, lng);
    })();
  });

  stream.on('error', (err: Error) => {
    changeStreamsActive = false;
    console.warn('Change Streams ошибка, включаем fallback:', err.message);
    startPeriodicHiveCleanup();
  });

  changeStreamsActive = true;
  console.log('Change Streams: слушаем удаления stings');
}
