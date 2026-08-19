import StingReaction from '../models/StingReaction';
import { ReactionType } from '../types/sting';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export async function getLikedStingIds(userId: string, stingIds: string[]): Promise<Set<string>> {
  if (stingIds.length === 0) {
    return new Set();
  }

  const reactions = await StingReaction.find({
    userId,
    stingId: { $in: stingIds },
  }).select('stingId');

  return new Set(reactions.map((reaction) => String(reaction.stingId)));
}

export async function hasUserLikedSting(stingId: string, userId: string): Promise<boolean> {
  const reaction = await StingReaction.exists({ stingId, userId });
  return reaction !== null;
}

export async function deleteReactionsForSting(stingId: string): Promise<void> {
  await StingReaction.deleteMany({ stingId });
}

export async function createReaction(
  stingId: string,
  userId: string,
  type: ReactionType,
  expiresAt: Date,
): Promise<boolean> {
  try {
    await StingReaction.create({ stingId, userId, type, expiresAt });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return false;
    }

    throw error;
  }
}

export async function deleteReaction(stingId: string, userId: string): Promise<boolean> {
  const result = await StingReaction.deleteOne({ stingId, userId });
  return result.deletedCount > 0;
}
