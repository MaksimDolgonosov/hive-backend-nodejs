import mongoose, { Types } from 'mongoose';
import Hive from '../models/Hive';
import Sting from '../models/Sting';

let changeStreamsActive = false;

export function areChangeStreamsActive(): boolean {
  return changeStreamsActive;
}

export async function handleStingRemoved(hiveId: Types.ObjectId | null | undefined): Promise<void> {
  if (!hiveId) {
    return;
  }

  const hive = await Hive.findById(hiveId);
  if (!hive) {
    return;
  }

  hive.activeStingsCount = Math.max(0, hive.activeStingsCount - 1);

  if (hive.activeStingsCount === 0) {
    await hive.deleteOne();
    return;
  }

  await hive.save();
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

export async function startStingDeletionWatcher(): Promise<void> {
  changeStreamsActive = false;

  if (!(await isReplicaSetAvailable())) {
    console.warn(
      'Replica set не настроен — Change Streams отключены. Очистка ульев при TTL не работает.',
    );
    return;
  }

  await enablePreImages();

  const stream = Sting.watch([{ $match: { operationType: 'delete' } }], {
    fullDocumentBeforeChange: 'whenAvailable',
  });

  stream.on('change', (change) => {
    void (async () => {
      const hiveId = change.fullDocumentBeforeChange?.hiveId;
      if (hiveId) {
        await handleStingRemoved(hiveId);
      }
    })();
  });

  stream.on('error', (err: Error) => {
    changeStreamsActive = false;
    console.warn('Change Streams ошибка:', err.message);
  });

  changeStreamsActive = true;
  console.log('Change Streams: слушаем удаления stings');
}
