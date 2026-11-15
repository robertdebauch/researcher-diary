// Максимальная правдоподобная скорость пешехода: всё, что быстрее, — дрейф GPS.
const MAX_WALKING_SPEED_KMPH = 60;

// Старые точки маршрута (без таймстампа) писались раз в 5 секунд — для них
// сохраняем прежнее поведение, чтобы цифры в архиве не «прыгнули» после обновления.
const LEGACY_POINT_INTERVAL_MS = 5000;

// Разрыв больше этого расстояния при неправдоподобной скорости считаем «телепортом»
// (восстановление сессии, потеря GPS) и рисуем маршрут отдельным сегментом.
const TELEPORT_GAP_METERS = 200;

// Как часто сбрасывать маршрут в IndexedDB. Раньше массив перезаписывался целиком
// каждые 5 секунд — на длинной прогулке это O(n²) по объёму записи.
export const ROUTE_SAVE_INTERVAL_MS = 20000;

/** Точка маршрута: [широта, долгота, время в мс]. Время нужно для честной скорости. */
export function createRoutePoint(latitude, longitude, timestamp = Date.now()) {
  return [latitude, longitude, timestamp];
}

function getPointTimestamp(point) {
  return point.length > 2 ? point[2] : null;
}

function resolveElapsedMs(point1, point2) {
  const startTime = getPointTimestamp(point1);
  const endTime = getPointTimestamp(point2);

  if (startTime === null || endTime === null) {
    return LEGACY_POINT_INTERVAL_MS;
  }

  return endTime - startTime;
}

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

/** Можно ли верить отрезку: положительный интервал времени и скорость пешехода. */
function isPlausibleSegment(point1, point2) {
  const elapsedMs = resolveElapsedMs(point1, point2);

  if (elapsedMs <= 0) {
    return false;
  }

  const distanceMeters = calculateDistance(point1, point2);
  const speedKmph = (distanceMeters * 3600) / elapsedMs;

  return speedKmph <= MAX_WALKING_SPEED_KMPH;
}

/**
 * Дистанция и время в движении по маршруту.
 * Отрезки с неправдоподобной скоростью (дрейф GPS) в расчёт не идут.
 */
export function calculateRouteStats(path) {
  if (!path || path.length < 2) {
    return { distanceMeters: 0, distanceKm: "0.00", movingMs: 0 };
  }

  let distanceMeters = 0;
  let movingMs = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const startPoint = path[i];
    const endPoint = path[i + 1];

    if (!isPlausibleSegment(startPoint, endPoint)) {
      continue;
    }

    distanceMeters += calculateDistance(startPoint, endPoint);
    movingMs += resolveElapsedMs(startPoint, endPoint);
  }

  return {
    distanceMeters,
    distanceKm: (distanceMeters / 1000).toFixed(2),
    movingMs,
  };
}

/**
 * Разбивает маршрут на сегменты по «телепортам» (восстановление сессии, потеря GPS).
 * Leaflet не умеет рисовать разрыв внутри одной ломаной, поэтому рисуем несколько линий.
 */
export function splitRouteIntoSegments(path) {
  if (!path || path.length === 0) {
    return [];
  }

  const segments = [[path[0]]];

  for (let i = 1; i < path.length; i++) {
    const previousPoint = path[i - 1];
    const point = path[i];
    const gapMeters = calculateDistance(previousPoint, point);

    if (gapMeters > TELEPORT_GAP_METERS && !isPlausibleSegment(previousPoint, point)) {
      segments.push([point]);
      continue;
    }

    segments[segments.length - 1].push(point);
  }

  return segments;
}

/** Убирает локальные выбросы GPS внутри сегмента, чтобы линия не «дёргалась». */
export function filterImplausiblePoints(points) {
  if (!points || points.length < 3) {
    return points ?? [];
  }

  const filtered = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const lastKeptPoint = filtered[filtered.length - 1];

    if (isPlausibleSegment(lastKeptPoint, points[i])) {
      filtered.push(points[i]);
    }
  }

  return filtered;
}

/** Добавляет точку в маршрут, пропуская повторы координат (стоим на месте). */
export function appendRoutePoint(route, coordinates) {
  const lastPoint = route[route.length - 1];

  if (
    lastPoint &&
    lastPoint[0] === coordinates[0] &&
    lastPoint[1] === coordinates[1]
  ) {
    return route;
  }

  return [...route, createRoutePoint(coordinates[0], coordinates[1])];
}

/** Русское склонение: 1 находка, 3 находки, 21 находка, 11 находок. */
export function findingsNoun(count) {
  const absolute = Math.abs(count) % 100;
  const lastDigit = absolute % 10;

  if (absolute > 10 && absolute < 20) {
    return "находок";
  }

  if (lastDigit === 1) {
    return "находка";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "находки";
  }

  return "находок";
}

/** Готовое сочетание числа и слова: «1 находка», «3 находки», «12 находок». */
export function formatFindingsCount(count) {
  return `${count} ${findingsNoun(count)}`;
}

export async function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxWidth) {
          const ratio = Math.min(maxWidth / width, maxWidth / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}
