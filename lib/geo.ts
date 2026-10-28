// Privacy offset: move a real coordinate 1–3 km in a random direction so the
// dot is placed *near* the user, never at their exact location. A fresh random
// offset is generated each session (this runs once per join), so the same user
// lands somewhere different every time.

const KM_PER_DEG_LAT = 111.32;

export function applyPrivacyOffset(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const distanceKm = 1 + Math.random() * 2; // 1–3 km
  const bearing = Math.random() * 2 * Math.PI; // random direction

  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEG_LAT;
  const latRad = (lat * Math.PI) / 180;
  const dLng =
    (distanceKm * Math.sin(bearing)) /
    (KM_PER_DEG_LAT * Math.cos(latRad) || KM_PER_DEG_LAT);

  return {
    lat: clamp(lat + dLat, -90, 90),
    lng: wrapLng(lng + dLng),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapLng(lng: number): number {
  // Keep longitude in [-180, 180].
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const EARTH_RADIUS_KM = 6371;
const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = (b.lat - a.lat) * TO_RAD;
  const dLng = (b.lng - a.lng) * TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * TO_RAD) *
      Math.cos(b.lat * TO_RAD) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Sample the shortest great-circle path between two points as [lng, lat] pairs
 * suitable for a GeoJSON LineString. Used for the connection arc.
 */
export function greatCirclePath(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  steps = 96,
): Array<[number, number]> {
  const φ1 = a.lat * TO_RAD;
  const λ1 = a.lng * TO_RAD;
  const φ2 = b.lat * TO_RAD;
  const λ2 = b.lng * TO_RAD;

  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((φ2 - φ1) / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
        ),
      ),
    );

  if (!Number.isFinite(d) || d < 1e-9) {
    return [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ];
  }

  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y =
      A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    points.push([
      Math.atan2(y, x) * TO_DEG,
      Math.atan2(z, Math.sqrt(x * x + y * y)) * TO_DEG,
    ]);
  }
  return points;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "";
  if (km < 10) return "under 10 km";
  return `${Math.round(km).toLocaleString()} km`;
}

