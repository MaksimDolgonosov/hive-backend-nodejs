import { Types } from 'mongoose';

import Device from '../models/Device';
import Invite from '../models/Invite';
import EmailOtpChallenge from '../models/EmailOtpChallenge';
import RefreshToken from '../models/RefreshToken';
import Sting from '../models/Sting';
import StingReaction from '../models/StingReaction';
import User from '../models/User';
import { emitStingExpired } from '../sockets/realtime';
import { AppError } from '../utils/AppError';
import { areChangeStreamsActive, handleStingRemoved } from './hive-cleanup.service';
import { deleteAvatarImage, deleteStingImages } from './storage.service';

async function deleteOwnedStingMedia(
  stings: Array<{ imageUrl: string; thumbnailUrl: string }>,
): Promise<void> {
  await Promise.allSettled(
    stings.map((sting) => deleteStingImages(sting.imageUrl, sting.thumbnailUrl)),
  );
}

async function removeLikesOnOtherStings(
  userId: string,
  ownedStingIds: Types.ObjectId[],
): Promise<void> {
  const likes = await StingReaction.find({ userId }).select('stingId');
  const ownedIdSet = new Set(ownedStingIds.map((id) => String(id)));
  const likedForeignIds = likes
    .map((like) => like.stingId)
    .filter((stingId) => !ownedIdSet.has(String(stingId)));

  if (likedForeignIds.length === 0) {
    return;
  }

  await Sting.updateMany(
    { _id: { $in: likedForeignIds }, reactionsCount: { $gt: 0 } },
    { $inc: { reactionsCount: -1 } },
  );
}

export async function deleteAccount(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const stings = await Sting.find({ authorId: userId }).select(
    '_id hiveId imageUrl thumbnailUrl location',
  );
  const ownedStingIds = stings.map((sting) => sting._id);
  const hiveIds = [
    ...new Set(
      stings
        .map((sting) => sting.hiveId)
        .filter((hiveId): hiveId is Types.ObjectId => hiveId != null)
        .map((hiveId) => String(hiveId)),
    ),
  ];

  await deleteOwnedStingMedia(stings);

  if (user.avatarUrl) {
    await deleteAvatarImage(userId).catch((error: unknown) => {
      console.warn('[account-deletion] Failed to delete avatar:', error);
    });
  }

  await removeLikesOnOtherStings(userId, ownedStingIds);
  await StingReaction.deleteMany({ userId });
  if (ownedStingIds.length > 0) {
    await StingReaction.deleteMany({ stingId: { $in: ownedStingIds } });
  }
  await Sting.deleteMany({ authorId: userId });

  if (!areChangeStreamsActive()) {
    for (const sting of stings) {
      const [lng, lat] = sting.location.coordinates;
      emitStingExpired(String(sting._id), sting.hiveId ? String(sting.hiveId) : null, lat, lng);
    }

    await Promise.all(hiveIds.map((hiveId) => handleStingRemoved(new Types.ObjectId(hiveId))));
  }

    await Invite.deleteMany({ ownerId: userId });
    await Device.deleteMany({ userId });
    await RefreshToken.deleteMany({ userId });
  await EmailOtpChallenge.deleteMany({ email: user.email });
  await user.deleteOne();
}
