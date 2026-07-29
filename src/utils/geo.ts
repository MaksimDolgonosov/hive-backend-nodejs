import { GeoPoint } from '../types/sting';

export function coordinatesToGeoPoint(coordinates: [number, number]): GeoPoint {
  const [lng, lat] = coordinates;
  return { lat, lng };
}

export function geoPointToCoordinates(point: GeoPoint): [number, number] {
  return [point.lng, point.lat];
}

export function bboxToGeoBox(swLng: number, swLat: number, neLng: number, neLat: number): [[number, number], [number, number]] {
  return [
    [swLng, swLat],
    [neLng, neLat],
  ];
}

export function pointInBbox(lat: number, lng: number, bbox: {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}): boolean {
  return lat >= bbox.swLat && lat <= bbox.neLat && lng >= bbox.swLng && lng <= bbox.neLng;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
