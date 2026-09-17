import {
  cellToLatLng,
  cellToParent,
  getHexagonEdgeLengthAvg,
  getResolution,
  latLngToCell,
  UNITS,
} from 'h3-js';

import { GeoPoint } from '../types/sting';

export const ZONE_RES = 8;
export const OVERVIEW_COUNTRY_RES = 5;
export const OVERVIEW_CITY_RES = 6;
export const ECHO_RES = 9;

export function zoneIdFromLatLng(lat: number, lng: number): string {
  return latLngToCell(lat, lng, ZONE_RES);
}

export function overviewCellIdFromZone(zoneId: string, res: number = OVERVIEW_COUNTRY_RES): string {
  const current = getResolution(zoneId);
  if (current <= res) {
    return zoneId;
  }
  return cellToParent(zoneId, res);
}

export function overviewCellIdFromLatLng(lat: number, lng: number, res: number): string {
  return latLngToCell(lat, lng, res);
}

export function echoCellIdFromLatLng(lat: number, lng: number): string {
  return latLngToCell(lat, lng, ECHO_RES);
}

export function cellCenter(cellId: string): GeoPoint {
  const [lat, lng] = cellToLatLng(cellId);
  return { lat, lng };
}

export function parentCell(cellId: string, res: number): string {
  const current = getResolution(cellId);
  if (current <= res) {
    return cellId;
  }
  return cellToParent(cellId, res);
}

export function cellRadiusM(res: number): number {
  return getHexagonEdgeLengthAvg(res, UNITS.m);
}

export function overviewResolutionForZoom(zoom: number): number {
  return zoom < 9 ? OVERVIEW_COUNTRY_RES : OVERVIEW_CITY_RES;
}
