// Максимальная правдоподобная скорость пешехода: всё, что быстрее, — дрейф GPS.
const MAX_WALKING_SPEED_KMPH = 60;

// Старые точки маршрута (без таймстампа) писались раз в 5 секунд — для них
// сохраняем прежнее поведение, чтобы цифры в архиве не «прыгнули» после обновления.
const LEGACY_POINT_INTERVAL_MS = 5000;

// Разрыв больше этого расстояния при неправдоподобной скорости считаем «телепортом»
// (восстановление сессии, потеря GPS) и рисуем маршрут отдельным сегментом.
const TELEPORT_GAP_METERS = 200;

// Разрыв во времени, после которого линия рвётся: пауза, уход в фон, потеря GPS.
// Статистика режет отрезки строже (30 с), но для рисования порог выше: иначе
// браузер, троттлящий геолокацию в фоне, рвёт линию на куски каждую минуту.
const SEGMENT_GAP_MS = 180000;

// Считаем отрезок «движением», только если скорость выше порога: иначе это дрожь
// GPS на месте (5–10 м за 5 секунд выглядят как 3–7 км/ч и портят среднюю скорость).
const MIN_MOVEMENT_SPEED_KMPH = 1;

// Если между точками прошло больше этого времени, считаем, что была пауза
// (фон, потеря сигнала): дистанция и время такого отрезка в статистику не идут.
const MAX_SAMPLE_GAP_MS = 30000;

// Не пишем точку, если она ближе этого расстояния к предыдущей — это шум приёма,
// а не перемещение. Заодно уменьшает «пилу» на линии.
const MIN_POINT_DISTANCE_METERS = 3;

// Точки с погрешностью больше этого значения не пишем в маршрут (дома, начало трека).
export const MAX_ACCURACY_METERS = 30;

// Допуск упрощения линии при отрисовке: 4–5 м убирает дрожание, сохраняя форму улицы.
const SIMPLIFY_TOLERANCE_METERS = 4;

// Как часто сбрасывать маршрут в IndexedDB. Раньше массив перезаписывался целиком
// каждые 5 секунд — на длинной прогулке это O(n²) по объёму записи.
export const ROUTE_SAVE_INTERVAL_MS = 20000;

// «Продолжить» — это отмена случайного «Остановить», а не склейка двух прогулок.
// Через три часа это уже другая прогулка: своё название, свой маршрут.
export const RESUME_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Можно ли продолжить завершённую экспедицию.
 * Только последнюю (более новых нет) и только если с конца прошло не больше
 * RESUME_WINDOW_MS. Незавершённую продолжать не нужно — она и так идёт.
 */
export function isResumableExpedition(expedition, expeditions, nowMs = Date.now()) {
  if (!expedition || !expedition.endTime) {
    return false;
  }

  const newestId = expeditions.reduce(
    (newest, item) => (item.id > newest ? item.id : newest),
    0,
  );

  if (expedition.id !== newestId) {
    return false;
  }

  return nowMs - new Date(expedition.endTime).getTime() <= RESUME_WINDOW_MS;
}

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

/** Между точками прошло слишком много времени — это пауза, а не пройденный путь. */
function isTimeGap(point1, point2) {
  const startTime = getPointTimestamp(point1);
  const endTime = getPointTimestamp(point2);

  if (startTime === null || endTime === null) {
    return false;
  }

  return endTime - startTime > SEGMENT_GAP_MS;
}

/**
 * Отрезок считается движением, если человек действительно шёл:
 * скорость в разумных пределах и между точками нет длинной паузы.
 */
function isMovementSegment(point1, point2) {
  const elapsedMs = resolveElapsedMs(point1, point2);

  if (elapsedMs <= 0 || elapsedMs > MAX_SAMPLE_GAP_MS) {
    return false;
  }

  const distanceMeters = calculateDistance(point1, point2);
  const speedKmph = (distanceMeters * 3600) / elapsedMs;

  return (
    speedKmph >= MIN_MOVEMENT_SPEED_KMPH &&
    speedKmph <= MAX_WALKING_SPEED_KMPH
  );
}

/**
 * Дистанция и время в движении по маршруту.
 * В расчёт идут только отрезки реального движения: дрожь на месте и паузы
 * (долгие разрывы между точками) не раздувают ни дистанцию, ни время.
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

    if (!isMovementSegment(startPoint, endPoint)) {
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

    // Пауза — тоже разрыв: без этого линия соединила бы точки по прямой,
    // хотя человек в это время стоял на месте или ехал в транспорте.
    if (isTimeGap(previousPoint, point)) {
      segments.push([point]);
      continue;
    }

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

/** Добавляет точку в маршрут, пропуская шум: слишком близкие точки не пишем. */
export function appendRoutePoint(route, coordinates) {
  const lastPoint = route[route.length - 1];

  if (
    lastPoint &&
    calculateDistance(lastPoint, coordinates) < MIN_POINT_DISTANCE_METERS
  ) {
    return route;
  }

  return [...route, createRoutePoint(coordinates[0], coordinates[1])];
}

/** Расстояние от точки до отрезка в метрах (локальная равнопромежуточная проекция). */
function pointToSegmentDistanceMeters(point, segmentStart, segmentEnd) {
  const latitudeRef =
    (((segmentStart[0] + segmentEnd[0]) / 2) * Math.PI) / 180;
  const metersPerDegreeLatitude = 110540;
  const metersPerDegreeLongitude = 111320 * Math.cos(latitudeRef);

  const toLocal = (value) => [
    (value[1] - segmentStart[1]) * metersPerDegreeLongitude,
    (value[0] - segmentStart[0]) * metersPerDegreeLatitude,
  ];

  const [pointX, pointY] = toLocal(point);
  const [endX, endY] = toLocal(segmentEnd);

  const lengthSquared = endX * endX + endY * endY;

  let projection = 0;

  if (lengthSquared > 0) {
    projection = (pointX * endX + pointY * endY) / lengthSquared;
    projection = Math.max(0, Math.min(1, projection));
  }

  const nearestX = projection * endX;
  const nearestY = projection * endY;

  return Math.hypot(pointX - nearestX, pointY - nearestY);
}

/**
 * Упрощение линии алгоритмом Дугласа–Пекера (для отрисовки).
 * Убирает дрожание GPS, сохраняя форму маршрута; исходные точки не меняются.
 */
export function simplifyPath(points, toleranceMeters = SIMPLIFY_TOLERANCE_METERS) {
  if (!points || points.length < 3) {
    return points ?? [];
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  let maxDistance = -1;
  let farthestIndex = -1;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = pointToSegmentDistanceMeters(
      points[i],
      firstPoint,
      lastPoint,
    );

    if (distance > maxDistance) {
      maxDistance = distance;
      farthestIndex = i;
    }
  }

  if (maxDistance > toleranceMeters) {
    const left = simplifyPath(points.slice(0, farthestIndex + 1), toleranceMeters);
    const right = simplifyPath(points.slice(farthestIndex), toleranceMeters);

    return [...left.slice(0, -1), ...right];
  }

  return [firstPoint, lastPoint];
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

/**
 * Название находки. Старые записи хранили только note — читаем его как название,
 * чтобы архив и карта не показывали пустые заголовки.
 */
export function getFindingName(finding) {
  return finding?.name?.trim() || finding?.note?.trim() || "";
}

/** Описание находки: новое поле description, у старых записей его нет. */
export function getFindingDescription(finding) {
  if (finding?.description?.trim()) {
    return finding.description.trim();
  }

  return finding?.name ? "" : finding?.note ?? "";
}

/** Экранирование текста для HTML-строки попапа Leaflet. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
