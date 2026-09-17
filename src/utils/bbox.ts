import { BboxQuery, GeoPoint } from '../types/sting';
import { haversineDistanceM } from './geo';

export function bboxCenter(bbox: BboxQuery): GeoPoint {
  return {
    lat: (bbox.swLat + bbox.neLat) / 2,
    lng: (bbox.swLng + bbox.neLng) / 2,
  };
}

export function bboxRadiusM(bbox: BboxQuery): number {
  const center = bboxCenter(bbox);
  return haversineDistanceM(center, { lat: bbox.neLat, lng: bbox.neLng });
}

export function expandBbox(bbox: BboxQuery, factor: number): BboxQuery {
  const center = bboxCenter(bbox);
  const halfLat = ((bbox.neLat - bbox.swLat) / 2) * factor;
  const halfLng = ((bbox.neLng - bbox.swLng) / 2) * factor;

  return {
    swLat: Math.max(-90, center.lat - halfLat),
    swLng: Math.max(-180, center.lng - halfLng),
    neLat: Math.min(90, center.lat + halfLat),
    neLng: Math.min(180, center.lng + halfLng),
  };
}

export function bboxFromCenterRadius(center: GeoPoint, radiusM: number): BboxQuery {
  const latDelta = radiusM / 111_320;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const lngDelta = radiusM / (111_320 * Math.max(0.01, Math.abs(cosLat)));

  return {
    swLat: Math.max(-90, center.lat - latDelta),
    swLng: Math.max(-180, center.lng - lngDelta),
    neLat: Math.min(90, center.lat + latDelta),
    neLng: Math.min(180, center.lng + lngDelta),
  };
}

export const NEARBY_EXPAND_MAX_STEPS = 5;
export const NEARBY_DEFAULT_MAX_RADIUS_M = 50_000;
export const NEAREST_MAX_DISTANCE_M = 300_000;
