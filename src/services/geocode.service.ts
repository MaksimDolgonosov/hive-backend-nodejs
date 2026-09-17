import Zone from '../models/Zone';
import { cellCenter } from '../utils/h3';

export async function resolveZoneLabel(zoneId: string): Promise<string | null> {
  const zone = await Zone.findById(zoneId).select('label');
  if (zone?.label) {
    return zone.label;
  }
  return null;
}

export async function reverseGeocodeCell(cellId: string): Promise<string | null> {
  const center = cellCenter(cellId);
  void center;
  return null;
}
