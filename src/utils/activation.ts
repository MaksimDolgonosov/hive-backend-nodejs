export type HiveStage = 'seed' | 'hive';

export interface HiveActivationStats {
  activeStingsCount: number;
  activationCount: number;
  contributorsCount: number;
  stage: HiveStage;
}

export function computeHiveActivation(
  authorIds: string[],
  options: { authorWeightCap: number; activationThreshold: number },
): HiveActivationStats {
  const byAuthor = new Map<string, number>();
  for (const authorId of authorIds) {
    byAuthor.set(authorId, (byAuthor.get(authorId) ?? 0) + 1);
  }

  let activationCount = 0;
  for (const count of byAuthor.values()) {
    activationCount += Math.min(count, options.authorWeightCap);
  }

  const contributorsCount = byAuthor.size;
  const stage: HiveStage =
    activationCount >= options.activationThreshold ? 'hive' : 'seed';

  return {
    activeStingsCount: authorIds.length,
    activationCount,
    contributorsCount,
    stage,
  };
}

export function isHiveCluster(stats: HiveActivationStats): boolean {
  return stats.activeStingsCount >= 2;
}
