import env from '../config/env';
import Hive, { IHive } from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import { GeoPoint } from '../types/sting';
import { computeHiveActivation, HiveStage, isHiveCluster } from '../utils/activation';

export interface HiveAssignmentResult {
  sting: ISting;
  hive: IHive | null;
  previousStage: HiveStage | null;
  ignited: boolean;
}

function statsFromStings(stings: ISting[]) {
  return computeHiveActivation(
    stings.map((item) => String(item.authorId)),
    {
      authorWeightCap: env.hiveAuthorWeightCap,
      activationThreshold: env.hiveActivationThreshold,
    },
  );
}

export async function refreshHiveFromStings(hive: IHive, now: Date = new Date()): Promise<IHive> {
  const stings = await Sting.find({
    hiveId: hive._id,
    expiresAt: { $gt: now },
    mediaPurgedAt: null,
  });

  const stats = statsFromStings(stings);
  hive.activeStingsCount = stats.activeStingsCount;
  hive.activationCount = stats.activationCount;
  hive.contributorsCount = stats.contributorsCount;
  hive.stage = stats.stage;
  if (stats.stage === 'hive' && !hive.ignitedAt) {
    hive.ignitedAt = now;
  }
  await hive.save();
  return hive;
}

function computeCentroid(points: GeoPoint[]): [number, number] {
  const total = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return [total.lng / points.length, total.lat / points.length];
}

export async function assignStingToHive(sting: ISting): Promise<HiveAssignmentResult> {
  const [lng, lat] = sting.location.coordinates;
  const now = new Date();

  const existingHive = await Hive.findOne({
    center: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: env.hiveRadiusM,
      },
    },
  });

  if (existingHive) {
    const previousStage = existingHive.stage;
    sting.hiveId = existingHive._id;
    await sting.save();
    const hive = await refreshHiveFromStings(existingHive, now);
    return {
      sting,
      hive,
      previousStage,
      ignited: previousStage === 'seed' && hive.stage === 'hive',
    };
  }

  const nearbyOrphans = await Sting.find({
    _id: { $ne: sting._id },
    hiveId: null,
    expiresAt: { $gt: now },
    mediaPurgedAt: null,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: env.hiveRadiusM,
      },
    },
  });

  const clusterStings = [...nearbyOrphans, sting];
  const stats = statsFromStings(clusterStings);

  if (!isHiveCluster(stats)) {
    return { sting, hive: null, previousStage: null, ignited: false };
  }

  const points: GeoPoint[] = clusterStings.map((item) => ({
    lat: item.location.coordinates[1],
    lng: item.location.coordinates[0],
  }));
  const [centroidLng, centroidLat] = computeCentroid(points);

  const hive = await Hive.create({
    center: { type: 'Point', coordinates: [centroidLng, centroidLat] },
    radiusM: env.hiveRadiusM,
    activeStingsCount: stats.activeStingsCount,
    activationCount: stats.activationCount,
    contributorsCount: stats.contributorsCount,
    stage: stats.stage,
    founderUserId: sting.authorId,
    ignitedAt: stats.stage === 'hive' ? now : null,
  });

  await Sting.updateMany(
    { _id: { $in: clusterStings.map((item) => item._id) } },
    { $set: { hiveId: hive._id } },
  );

  sting.hiveId = hive._id;
  return {
    sting,
    hive,
    previousStage: null,
    ignited: stats.stage === 'hive',
  };
}

export { statsFromStings };
