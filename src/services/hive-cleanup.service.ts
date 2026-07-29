import mongoose, { Types } from 'mongoose';
import {
  emitHiveDissolved,
  emitHiveUpdated,
  emitStingExpired,
} from '../sockets/realtime';
import env from '../config/env';
import Hive from '../models/Hive';
import Sting from '../models/Sting';
import { coordinatesToGeoPoint } from '../utils/geo';
import { toPublicHive } from '../utils/sting.mapper';

let changeStreamsActive = false;
let periodicCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function areChangeStreamsActive(): boolean {
  return changeStreamsActive;
}

export async function handleStingRemoved(
  hiveId: Types.ObjectId,
): Promise<'dissolved' | 'updated' | 'missing'> {
  const hive = await Hive.findById(hiveId);
  if (!hive) {
    return 'missing';
  }

  hive.activeStingsCount = Math.max(0, hive.activeStingsCount - 1);

  if (hive.activeStingsCount === 0) {
    await hive.deleteOne();
    return 'dissolved';
  }

  await hive.save();
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

  const hiveBefore = await Hive.findById(hiveId);
  if (!hiveBefore) {
    return;
  }

  const center = coordinatesToGeoPoint(hiveBefore.center.coordinates);
  const outcome = await handleStingRemoved(hiveId);

  if (outcome === 'dissolved') {
    emitHiveDissolved(String(hiveId), center.lat, center.lng);
    return;
  }

  if (outcome === 'updated') {
    const hive = await Hive.findById(hiveId);
    if (hive) {
      emitHiveUpdated(toPublicHive(hive));
    }
  }
}

/** Пересчитывает activeStingsCount по фактическим жала́м — fallback без Change Streams. */
export async function reconcileHives(): Promise<void> {
  const now = new Date();
  const hives = await Hive.find();

  await Promise.all(
    hives.map(async (hive) => {
      const activeCount = await Sting.countDocuments({
        hiveId: hive._id,
        expiresAt: { $gt: now },
      });

      if (activeCount === 0) {
        const center = coordinatesToGeoPoint(hive.center.coordinates);
        await hive.deleteOne();
        emitHiveDissolved(String(hive._id), center.lat, center.lng);
        return;
      }

      if (hive.activeStingsCount !== activeCount) {
        hive.activeStingsCount = activeCount;
        await hive.save();
        emitHiveUpdated(toPublicHive(hive));
      }
    }),
  );
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

  void reconcileHives();

  periodicCleanupTimer = setInterval(() => {
    void reconcileHives().catch((err: Error) => {
      console.warn('Ошибка периодической очистки ульев:', err.message);
    });
  }, env.hiveCleanupIntervalMs);

  console.log(
    `Периодическая очистка ульев: каждые ${env.hiveCleanupIntervalMs / 1000}с (fallback без replica set)`,
  );
}

export async function startStingDeletionWatcher(): Promise<void> {
  changeStreamsActive = false;

  if (!(await isReplicaSetAvailable())) {
    startPeriodicHiveCleanup();
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
