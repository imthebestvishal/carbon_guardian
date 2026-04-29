/**
 * Instant client-side Haversine distance calculation.
 * Eliminates the need for a backend round-trip for distance.
 * @returns distance in kilometers
 */
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Estimate travel duration in minutes based on distance and mode.
 */
export function estimateDuration(distanceKm, mode = "car") {
  const speeds = { walk: 5, bike: 15, metro: 35, cab: 25, car: 25 };
  const speed = speeds[mode] || 25;
  return (distanceKm / speed) * 60;
}
