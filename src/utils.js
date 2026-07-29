export function calculateDistance(point1, point2) {
  const R = 6371e3; // Радиус Земли в метрах
  const phi1 = (point1[0] * Math.PI) / 180;
  const phi2 = (point2[0] * Math.PI) / 180;
  const deltaPhi = ((point2[0] - point1[0]) * Math.PI) / 180;
  const deltaLambda = ((point2[1] - point1[1]) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function calculateTotalDistance(path) {
  if (!path || path.length < 2) return 0;

  let totalMeters = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalMeters += calculateDistance(path[i], path[i + 1]);
  }

  return (totalMeters / 1000).toFixed(2);
}

export function calculateAverageSpeed(distanceKm, startTime, endTime) {
  if (!startTime || !endTime) {
    return "0.00";
  }

  const diffMs = new Date(endTime) - new Date(startTime);
  const hours = diffMs / (1000 * 60 * 60); // Переводим миллисекунды в часы

  if (hours === 0) {
    return "0.00";
  }

  const speed = distanceKm / hours;
  return speed.toFixed(2);
}
