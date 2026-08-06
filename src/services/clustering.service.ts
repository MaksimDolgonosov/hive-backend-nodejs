import env from '../config/env';
import Hive from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import { GeoPoint } from '../types/sting';

function computeCentroid(points: GeoPoint[]): [number, number] {
  const total = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return [total.lng / points.length, total.lat / points.length];
}

export async function assignStingToHive(sting: ISting): Promise<ISting> {
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
    const newCount = existingHive.activeStingsCount + 1;

    if (newCount < env.hiveActivationThreshold) {
      return sting;
    }

    sting.hiveId = existingHive._id;
    await sting.save();
    existingHive.activeStingsCount += 1;
    await existingHive.save();
    return sting;
  }

  const nearbyOrphans = await Sting.find({
    _id: { $ne: sting._id },
    hiveId: null,
    expiresAt: { $gt: now },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: env.hiveRadiusM,
      },
    },
  });

  const totalCount = nearbyOrphans.length + 1;

  if (totalCount < env.hiveActivationThreshold) {
    return sting;
  }

  const points: GeoPoint[] = [
    { lat, lng },
    ...nearbyOrphans.map((item) => ({
      lat: item.location.coordinates[1],
      lng: item.location.coordinates[0],
    })),
  ];
  const [centroidLng, centroidLat] = computeCentroid(points);

  const hive = await Hive.create({
    center: { type: 'Point', coordinates: [centroidLng, centroidLat] },
    radiusM: env.hiveRadiusM,
    activeStingsCount: totalCount,
  });

  const stingIds = [...nearbyOrphans.map((item) => item._id), sting._id];
  await Sting.updateMany({ _id: { $in: stingIds } }, { $set: { hiveId: hive._id } });

  sting.hiveId = hive._id;
  return sting;
}
