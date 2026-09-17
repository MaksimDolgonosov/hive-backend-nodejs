import Hive from '../models/Hive';
import Sting from '../models/Sting';
import { BboxQuery } from '../types/sting';
import { createTtlCache } from '../utils/cache';
import { bboxToGeoBox } from '../utils/geo';
import {
  cellCenter,
  cellRadiusM,
  overviewCellIdFromLatLng,
  overviewResolutionForZoom,
  parentCell,
} from '../utils/h3';

const overviewCache = createTtlCache<{
  clusters: Array<{
    cellId: string;
    center: { lat: number; lng: number };
    radiusM: number;
    activeStingsCount: number;
    activeHivesCount: number;
    label: string | null;
  }>;
  resolution: number;
}>(60_000);

const MAX_CLUSTERS = 500;

export async function getMapOverview(bbox: BboxQuery, zoom: number): Promise<{
  clusters: Array<{
    cellId: string;
    center: { lat: number; lng: number };
    radiusM: number;
    activeStingsCount: number;
    activeHivesCount: number;
    label: string | null;
  }>;
  resolution: number;
}> {
  const resolution = overviewResolutionForZoom(zoom);
  const cacheKey = `${bbox.swLat}:${bbox.swLng}:${bbox.neLat}:${bbox.neLng}:${resolution}`;
  const cached = overviewCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const now = new Date();
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);

  const [stings, hives] = await Promise.all([
    Sting.find({
      location: { $geoWithin: { $box: box } },
      expiresAt: { $gt: now },
      mediaPurgedAt: null,
    }).select('location overviewCellId zoneId'),
    Hive.find({
      center: { $geoWithin: { $box: box } },
      stage: 'hive',
    }).select('center'),
  ]);

  const clusters = new Map<
    string,
    { activeStingsCount: number; activeHivesCount: number }
  >();

  const bump = (cellId: string, field: 'activeStingsCount' | 'activeHivesCount') => {
    const current = clusters.get(cellId) ?? { activeStingsCount: 0, activeHivesCount: 0 };
    current[field] += 1;
    clusters.set(cellId, current);
  };

  for (const sting of stings) {
    const [lng, lat] = sting.location.coordinates;
    const cellId =
      sting.overviewCellId && resolution === 5
        ? parentCell(sting.overviewCellId, resolution)
        : overviewCellIdFromLatLng(lat, lng, resolution);
    bump(cellId, 'activeStingsCount');
  }

  for (const hive of hives) {
    const [lng, lat] = hive.center.coordinates;
    bump(overviewCellIdFromLatLng(lat, lng, resolution), 'activeHivesCount');
  }

  const result = {
    resolution,
    clusters: [...clusters.entries()]
      .slice(0, MAX_CLUSTERS)
      .map(([cellId, counts]) => ({
        cellId,
        center: cellCenter(cellId),
        radiusM: Math.round(cellRadiusM(resolution)),
        activeStingsCount: counts.activeStingsCount,
        activeHivesCount: counts.activeHivesCount,
        label: null,
      })),
  };

  overviewCache.set(cacheKey, result);
  return result;
}
