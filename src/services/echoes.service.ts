import StingEcho from '../models/StingEcho';
import User from '../models/User';
import { ISting } from '../models/Sting';
import { PublicEchoCell } from '../types/growth';
import { BboxQuery } from '../types/sting';
import { bboxToGeoBox, coordinatesToGeoPoint } from '../utils/geo';
import { cellCenter, parentCell, ZONE_RES } from '../utils/h3';
import { ECHO_RETENTION_MS } from '../utils/ttl';

const ECHO_LIMIT = 300;

export async function recordEchoForExpiredSting(sting: ISting): Promise<void> {
  if (!sting.echoCellId || !sting.zoneId) {
    return;
  }

  const author = await User.findById(sting.authorId).select('settings');
  if (author && author.settings?.allowEcho === false) {
    return;
  }

  const lastSeenAt = sting.createdAt;
  const expiresAt = new Date(lastSeenAt.getTime() + ECHO_RETENTION_MS);
  const center = cellCenter(sting.echoCellId);

  await StingEcho.updateOne(
    { cellId: sting.echoCellId },
    [
      {
        $set: {
          zoneId: sting.zoneId,
          count: { $add: [{ $ifNull: ['$count', 0] }, 1] },
          lastSeenAt: { $max: [{ $ifNull: ['$lastSeenAt', lastSeenAt] }, lastSeenAt] },
          expiresAt: { $max: [{ $ifNull: ['$expiresAt', expiresAt] }, expiresAt] },
          center: { type: 'Point', coordinates: [center.lng, center.lat] },
        },
      },
    ],
    { upsert: true },
  );
}

export async function findEchoesInBbox(bbox: BboxQuery): Promise<PublicEchoCell[]> {
  const now = new Date();
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);

  const cells = await StingEcho.find({
    center: { $geoWithin: { $box: box } },
    expiresAt: { $gt: now },
    count: { $gte: 1 },
  })
    .sort({ lastSeenAt: -1 })
    .limit(ECHO_LIMIT + 1);

  if (cells.length <= ECHO_LIMIT) {
    return cells.map((cell) => ({
      cellId: cell.cellId,
      center: coordinatesToGeoPoint(cell.center.coordinates),
      count: cell.count,
      lastSeenAt: cell.lastSeenAt.toISOString(),
    }));
  }

  const aggregated = new Map<
    string,
    { count: number; lastSeenAt: Date }
  >();

  for (const cell of cells) {
    const parent = parentCell(cell.cellId, ZONE_RES);
    const current = aggregated.get(parent);
    if (!current) {
      aggregated.set(parent, { count: cell.count, lastSeenAt: cell.lastSeenAt });
      continue;
    }
    current.count += cell.count;
    if (cell.lastSeenAt > current.lastSeenAt) {
      current.lastSeenAt = cell.lastSeenAt;
    }
  }

  return [...aggregated.entries()]
    .slice(0, ECHO_LIMIT)
    .map(([cellId, value]) => ({
      cellId,
      center: cellCenter(cellId),
      count: value.count,
      lastSeenAt: value.lastSeenAt.toISOString(),
    }));
}
