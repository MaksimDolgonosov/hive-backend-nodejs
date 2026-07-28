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
