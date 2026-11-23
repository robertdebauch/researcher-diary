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

// Пунктир «мы знаем, что ты тут шёл, но данных нет» рисуем только для коротких
// разрывов: через полгорода он выглядел бы как ошибка карты.
export const MAX_BREAK_DASH_METERS = 300;

// Считаем отрезок «движением», только если скорость выше порога: иначе это дрожь
// GPS на месте (5–10 м за 5 секунд выглядят как 3–7 км/ч и портят среднюю скорость).
const MIN_MOVEMENT_SPEED_KMPH = 1;

// Пределы разрыва для статистики. Ходьбу считаем при разрыве не больше 30 минут,
// транспорт — до часа: иначе утренний автобус 9 км за 43 минуты выпадал из отчёта.
// Осознанные паузы отсекаются флагом в точке, а не временем.
const MAX_WALKING_GAP_MS = 30 * 60 * 1000;
const MAX_TRANSPORT_GAP_MS = 60 * 60 * 1000;

// Выше этой средней скорости считаем, что человек ехал, а не шёл: такие отрезки
// идут в отдельный счётчик «транспорт» и не раздувают пешую дистанцию.
export const TRANSPORT_SPEED_KMPH = 12;

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

/**
 * Точка маршрута: [широта, долгота, время в мс, флаг разрыва (0/1), точность в м].
 * Флаг стоит на первой точке после паузы; точность нужна, чтобы понимать,
 * сколько точек отбрасывает фильтр в реальных условиях. Старые точки без
 * времени/флага/точности читаются как раньше.
 */
export function createRoutePoint(
  latitude,
  longitude,
  timestamp = Date.now(),
  isSegmentStart = false,
  accuracy = null,
) {
  return [
    latitude,
    longitude,
    timestamp,
    isSegmentStart ? 1 : 0,
    accuracy,
  ];
}

function isSegmentStartPoint(point) {
  return point.length > 3 && point[3] === 1;
}

/** Точность точки в метрах (у старых точек её нет). */
export function getPointAccuracy(point) {
  return point.length > 4 ? point[4] : null;
}

/**
 * Leaflet понимает только [lat, lng] и [lat, lng, alt]; массив из четырёх чисел
 * он превращает в null и падает. Всё лишнее (время, флаг разрыва) отрезаем.
 */
export function toLeafletPositions(points) {
  return points.map((point) => [point[0], point[1]]);
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

function getSegmentSpeedKmph(point1, point2, elapsedMs) {
  return (calculateDistance(point1, point2) * 3600) / elapsedMs;
}

/**
 * Классифицирует отрезок для статистики: пешком, транспорт или «не движение».
 * Ручная пауза (флаг) отсекается всегда; разрыв ограничен по-разному для
 * ходьбы (30 мин) и транспорта (60 мин).
 */
function classifyRouteSegment(point1, point2) {
  if (isSegmentStartPoint(point2)) {
    return null;
  }

  const elapsedMs = resolveElapsedMs(point1, point2);

  if (elapsedMs <= 0) {
    return null;
  }

  const distanceMeters = calculateDistance(point1, point2);
  const speedKmph = getSegmentSpeedKmph(point1, point2, elapsedMs);

  if (
    speedKmph < MIN_MOVEMENT_SPEED_KMPH ||
    speedKmph > MAX_WALKING_SPEED_KMPH
  ) {
    return null;
  }

  const mode = speedKmph > TRANSPORT_SPEED_KMPH ? "transport" : "walk";
  const maxGapMs = mode === "transport" ? MAX_TRANSPORT_GAP_MS : MAX_WALKING_GAP_MS;

  if (elapsedMs > maxGapMs) {
    return null;
  }

  return { mode, elapsedMs, distanceMeters, speedKmph };
}

/**
 * Дистанция и время по маршруту, раздельно для ходьбы и транспорта.
 * В расчёт идут отрезки реального перемещения; ручные паузы и долгие простои
 * не раздувают ни дистанцию, ни время. Транспорт (быстрее TRANSPORT_SPEED_KMPH)
 * не попадает в пешую дистанцию, чтобы автобус не притворялся ходьбой.
 */
export function calculateRouteStats(path) {
  const emptyStats = {
    distanceMeters: 0,
    distanceKm: "0.00",
    movingMs: 0,
    transportMeters: 0,
    transportKm: "0.00",
    transportMs: 0,
  };

  if (!path || path.length < 2) {
    return emptyStats;
  }

  let walkingMeters = 0;
  let walkingMs = 0;
  let transportMeters = 0;
  let transportMs = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const segment = classifyRouteSegment(path[i], path[i + 1]);

    if (!segment) {
      continue;
    }

    if (segment.mode === "transport") {
      transportMeters += segment.distanceMeters;
      transportMs += segment.elapsedMs;
    } else {
      walkingMeters += segment.distanceMeters;
      walkingMs += segment.elapsedMs;
    }
  }

  return {
    distanceMeters: walkingMeters,
    distanceKm: (walkingMeters / 1000).toFixed(2),
    movingMs: walkingMs,
    transportMeters,
    transportKm: (transportMeters / 1000).toFixed(2),
    transportMs,
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

    // Пауза — тоже разрыв: флаг стоит на первой точке после неё, поэтому ручная
    // пауза рвёт линию даже короче SEGMENT_GAP_MS. Без флага смотрим на время.
    if (isSegmentStartPoint(point) || isTimeGap(previousPoint, point)) {
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

// Чтобы дрожь GPS не красила пеший путь в «транспорт», режим засчитываем только
// при устойчивом движении: минимум минута и 150 метров.
const MIN_TRANSPORT_RUN_MS = 60 * 1000;
const MIN_TRANSPORT_RUN_METERS = 150;

/**
 * Делит маршрут на «прогоны» одинакового режима: пешком или транспорт.
 * Новый прогон начинается на паузе (флаг), временном разрыве, неправдоподобном
 * прыжке и при смене режима. Короткие быстрые всплески (дрожь GPS) считаем
 * пешими, чтобы линия не мигала синим.
 */
export function splitRouteIntoRuns(path) {
  if (!path || path.length === 0) {
    return [];
  }

  const runs = [];
  let current = { mode: "walk", points: [path[0]] };

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const point = path[index];

    const elapsedMs = resolveElapsedMs(previous, point);
    const distanceMeters = calculateDistance(previous, point);
    const speedKmph =
      elapsedMs > 0 ? (distanceMeters * 3600) / elapsedMs : Infinity;

    const startsNewRun =
      isSegmentStartPoint(point) ||
      isTimeGap(previous, point) ||
      speedKmph > MAX_WALKING_SPEED_KMPH;

    const mode = speedKmph > TRANSPORT_SPEED_KMPH ? "transport" : "walk";

    if (startsNewRun) {
      runs.push(current);
      current = { mode, points: [point] };
      continue;
    }

    if (mode !== current.mode) {
      // Смена режима: граничную точку отдаём новому прогону, чтобы линии стыковались.
      const boundary = current.points[current.points.length - 1];
      runs.push(current);
      current = { mode, points: [boundary, point] };
      continue;
    }

    current.points.push(point);
  }

  runs.push(current);

  return runs.map((run) => {
    if (run.mode !== "transport") {
      return run;
    }

    const first = run.points[0];
    const last = run.points[run.points.length - 1];
    const durationMs = (last[2] ?? 0) - (first[2] ?? 0);

    let meters = 0;
    for (let index = 1; index < run.points.length; index += 1) {
      meters += calculateDistance(run.points[index - 1], run.points[index]);
    }

    const isSustained =
      (durationMs >= MIN_TRANSPORT_RUN_MS ||
        meters >= MIN_TRANSPORT_RUN_METERS) &&
      meters > 0;

    return isSustained ? run : { mode: "walk", points: run.points };
  });
}

/**
 * Разрывы маршрута: где линия обрывается и почему.
 * `isPause` — ручная пауза (флаг в точке), иначе «нет данных» (фон, потеря GPS).
 * Длительность и расстояние не хранятся — считаются из соседних точек.
 */
export function getRouteBreaks(path) {
  if (!path || path.length < 2) {
    return [];
  }

  const breaks = [];

  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];

    if (!isSegmentStartPoint(to) && !isTimeGap(from, to)) {
      continue;
    }

    breaks.push({
      from,
      to,
      isPause: isSegmentStartPoint(to),
      durationMs: resolveElapsedMs(from, to),
      distanceMeters: calculateDistance(from, to),
    });
  }

  return breaks;
}

/**
 * Почему запись прервалась — по журналу диагностики между точками разрыва.
 * Возвращает "app-closed", "screen-off" или "unknown".
 */
export function getGapReason(fromMs, toMs, diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return "unknown";
  }

  let sawScreenOff = false;

  for (const row of diagnostics) {
    const time = new Date(row.time).getTime();

    if (!Number.isFinite(time) || time < fromMs || time > toMs) {
      continue;
    }

    // «Остановить» и сразу «Продолжить» — не пауза, а новый отрезок прогулки.
    if (row.type === "expedition-resume") {
      return "resumed";
    }

    if (row.type === "pagehide") {
      return "app-closed";
    }

    const isHidden =
      row.type === "freeze" ||
      (row.type === "visibility" && row.details?.state === "hidden");

    if (isHidden) {
      sawScreenOff = true;
    }
  }

  return sawScreenOff ? "screen-off" : "unknown";
}

/** «40 сек», «12 мин», «1 ч 12 мин» — для попапа разрыва. */
export function formatGapDuration(durationMs) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));

  if (seconds < 60) {
    return `${seconds} сек`;
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${totalMinutes} мин`;
  }

  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

/** «14:20–14:32» — время до и после разрыва, если у точек есть таймстампы. */
export function formatBreakTimeRange(point1, point2) {
  const startTime = getPointTimestamp(point1);
  const endTime = getPointTimestamp(point2);

  if (startTime === null || endTime === null) {
    return "";
  }

  const format = (value) =>
    new Date(value).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return `${format(startTime)}–${format(endTime)}`;
}

/** Можно ли писать маршрут в базу: пустой массив — это «не загрузилось», а не «стёрли». */
export function canPersistRoute(route) {
  return Array.isArray(route) && route.length > 0;
}

/**
 * Убирает локальные выбросы GPS внутри сегмента, чтобы линия не «дёргалась». */
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

/**
 * Добавляет точку в маршрут, пропуская шум: слишком близкие точки не пишем.
 * `isSegmentStart` помечает первую точку после паузы — по ней рисуется разрыв.
 */
export function appendRoutePoint(
  route,
  coordinates,
  { isSegmentStart = false, accuracy = null } = {},
) {
  const lastPoint = route[route.length - 1];

  if (
    lastPoint &&
    calculateDistance(lastPoint, coordinates) < MIN_POINT_DISTANCE_METERS
  ) {
    return route;
  }

  return [
    ...route,
    createRoutePoint(
      coordinates[0],
      coordinates[1],
      Date.now(),
      isSegmentStart,
      accuracy,
    ),
  ];
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

/**
 * Сжимает фото перед записью в IndexedDB.
 * EXIF-ориентация: без `imageOrientation: "from-image"` портретные снимки
 * с телефона ложились в базу повёрнутыми набок.
 */
export async function compressImage(file, maxWidth = 1200, quality = 0.7) {
  const bitmap = await loadOrientedBitmap(file);
  const ratio = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);

  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  return canvas.toDataURL("image/jpeg", quality);
}

/** Читает файл с учётом EXIF; если браузер не умеет — обычный Image. */
async function loadOrientedBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      console.warn("createImageBitmap не сработал, читаем через Image:", error);
    }
  }

  return loadBitmapFallback(file);
}

function loadBitmapFallback(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = event.target.result;
    };
    reader.onerror = reject;
  });
}
