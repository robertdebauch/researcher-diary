/**
 * Проверка математики маршрута без тест-фреймворка: `npm run check:route`.
 * Фиксирует инварианты Этапа 2: таймстампы в точках, честная скорость,
 * троттлинг-совместимый формат, «телепорты» отдельными сегментами.
 */
import {
  appendRoutePoint,
  calculateDistance,
  calculateRouteStats,
  createRoutePoint,
  filterImplausiblePoints,
  isResumableExpedition,
  RESUME_WINDOW_MS,
  simplifyPath,
  splitRouteIntoSegments,
} from "../src/utils.js";

const results = [];
const check = (name, actual, expected) => {
  const isOk = String(actual) === String(expected);
  results.push(
    `${isOk ? "OK  " : "FAIL"} ${name}: ${actual}${isOk ? "" : ` (ожидалось ${expected})`}`,
  );
};

const startTime = 1_700_000_000_000;
const metersToLatitude = (meters) => meters / 111_320;
const metersToLongitude = (meters, latitude = 55.75) =>
  meters / (111_320 * Math.cos((latitude * Math.PI) / 180));
const steadyPoint = (index) =>
  createRoutePoint(
    55.75 + metersToLatitude(7 * index),
    37.61,
    startTime + index * 5000,
  );

// 1. Ровная прогулка: 7 м за 5 с, 10 отрезков = 70 м / 50 с.
const steadyRoute = Array.from({ length: 11 }, (_, index) => steadyPoint(index));
const steadyStats = calculateRouteStats(steadyRoute);
check("ровный маршрут, дистанция (км)", steadyStats.distanceKm, "0.07");
check("ровный маршрут, время в движении (с)", steadyStats.movingMs / 1000, "50");
check(
  "ровный маршрут, скорость (км/ч, 1 знак)",
  (steadyStats.distanceMeters / 1000 / (steadyStats.movingMs / 3600000)).toFixed(1),
  "5.0",
);

// 2. Телепорт: точка в ~1.2 км за 5 секунд (пешком невозможно).
const teleportPoint = createRoutePoint(55.76, 37.62, startTime + 5 * 5000);
const routeWithTeleport = [...steadyRoute.slice(0, 5), teleportPoint, ...steadyRoute.slice(5)];
const teleportStats = calculateRouteStats(routeWithTeleport);
const drawnSegments = splitRouteIntoSegments(routeWithTeleport).filter(
  (segment) => segment.length > 1,
);
check(
  "телепорт: дистанция только из правдоподобных отрезков",
  teleportStats.distanceKm,
  "0.06",
);
check("телепорт: время в движении (с)", teleportStats.movingMs / 1000, "45");
check("телепорт: на карте две отдельные линии", drawnSegments.length, 2);
check(
  "телепорт: прыжок не попал ни в одну нарисованную линию",
  drawnSegments.some((segment) =>
    segment.some((point) => point[0] === 55.76 && point[1] === 37.62),
  ),
  "false",
);

// 3. Старые точки без таймстампа — прежняя математика (интервал 5 с).
const legacyRoute = Array.from({ length: 11 }, (_, index) => [
  55.75 + metersToLatitude(7 * index),
  37.61,
]);
check("легаси-маршрут дистанция", calculateRouteStats(legacyRoute).distanceKm, "0.07");
check(
  "легаси-маршрут время в движении (с)",
  calculateRouteStats(legacyRoute).movingMs / 1000,
  "50",
);

// 4. Дрейф: выброс на ~1 км отбрасывается, нормальные точки остаются.
const driftedRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.7505, 37.61, startTime + 5000),
  createRoutePoint(55.76, 37.61, startTime + 10000),
  createRoutePoint(55.7505, 37.61, startTime + 15000),
];
const filteredRoute = filterImplausiblePoints(driftedRoute);
check("дрейф: осталось точек", filteredRoute.length, 3);
check("дрейф: выброс удалён", filteredRoute.some((point) => point[0] === 55.76), "false");

// 5. Дедупликация одинаковых координат и формат точки.
const routeWithOnePoint = appendRoutePoint([], [55.75, 37.61]);
check("дедуп: первая точка добавлена", routeWithOnePoint.length, 1);
check(
  "дедуп: повтор проигнорирован",
  appendRoutePoint(routeWithOnePoint, [55.75, 37.61]).length,
  1,
);
check(
  "дедуп: новая точка добавлена",
  appendRoutePoint(routeWithOnePoint, [55.751, 37.61]).length,
  2,
);
check("формат точки содержит время", routeWithOnePoint[0].length, 3);
check(
  "1 градус широты ~ 111 км",
  Math.round(calculateDistance([0, 0], [1, 0]) / 1000),
  111,
);

// 6. Стоим на месте: микро-дрожь (1 м за 5 с = 0.72 км/ч) не считается движением.
const jitterRoute = Array.from({ length: 11 }, (_, index) =>
  createRoutePoint(
    55.75 + metersToLatitude(index),
    37.61,
    startTime + index * 5000,
  ),
);
const jitterStats = calculateRouteStats(jitterRoute);
check("остановка: дистанция (км)", jitterStats.distanceKm, "0.00");
check("остановка: время в движении (с)", jitterStats.movingMs / 1000, "0");

// 7. Длинная пауза (5 минут между точками) — не движение, даже если смещение есть.
const pausedRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(100), 37.61, startTime + 300000),
];
check("пауза: дистанция (км)", calculateRouteStats(pausedRoute).distanceKm, "0.00");
check(
  "пауза: время в движении (с)",
  calculateRouteStats(pausedRoute).movingMs / 1000,
  "0",
);

// 8. Короткий интервал движения считается как обычно: 30 м за 20 с.
const shortGapRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(30), 37.61, startTime + 20000),
];
check(
  "интервал 20 с: дистанция (км)",
  calculateRouteStats(shortGapRoute).distanceKm,
  "0.03",
);
check(
  "интервал 20 с: время в движении (с)",
  calculateRouteStats(shortGapRoute).movingMs / 1000,
  "20",
);

// 9. Порог записи точки: ближе 3 м — шум, дальше — движение.
const singlePointRoute = appendRoutePoint([], [55.75, 37.61]);
check(
  "шум 1 м не пишется",
  appendRoutePoint(singlePointRoute, [55.75 + metersToLatitude(1), 37.61]).length,
  1,
);
check(
  "смещение 5 м пишется",
  appendRoutePoint(singlePointRoute, [55.75 + metersToLatitude(5), 37.61]).length,
  2,
);

// 10. Сглаживание: «пила» ±3 м вдоль прямой схлопывается, угол сохраняется.
const zigzagRoute = Array.from({ length: 40 }, (_, index) =>
  createRoutePoint(
    55.75 + metersToLatitude(index * 10),
    37.61 + (index % 2 === 0 ? 0 : metersToLongitude(3)),
    startTime + index * 5000,
  ),
);
check("сглаживание: пила схлопнута", simplifyPath(zigzagRoute).length, 2);

const cornerRoute = Array.from({ length: 21 }, (_, index) =>
  createRoutePoint(
    55.75 + (index <= 10 ? 0 : metersToLatitude((index - 10) * 10)),
    37.61 + metersToLongitude(Math.min(index, 10) * 10),
    startTime + index * 5000,
  ),
);
check("сглаживание: угол сохранён", simplifyPath(cornerRoute).length, 3);

// 11. Пауза рвёт линию: 5 минут между точками — это не путь по прямой.
const pauseGapRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(7), 37.61, startTime + 5000),
  createRoutePoint(55.76, 37.62, startTime + 5000 + 300000),
  createRoutePoint(55.76 + metersToLatitude(7), 37.62, startTime + 10000 + 300000),
];
check(
  "пауза: на карте две отдельные линии",
  splitRouteIntoSegments(pauseGapRoute).filter((segment) => segment.length > 1).length,
  2,
);
check(
  "пауза: дистанция через паузу не считается (км)",
  calculateRouteStats(pauseGapRoute).distanceKm,
  "0.01",
);

// 12. Короткий разрыв (минута) линию не рвёт: так выглядит троттлинг в фоне.
const shortBackgroundGapRoute = Array.from({ length: 4 }, (_, index) =>
  createRoutePoint(
    55.75 + metersToLatitude(index * 7),
    37.61,
    startTime + index * 60000,
  ),
);
check(
  "фон 60 с: линия остаётся целой",
  splitRouteIntoSegments(shortBackgroundGapRoute).length,
  1,
);

// 13. Легаси-точки без времени не рвутся по времени (у них его просто нет).
check(
  "легаси-маршрут без времени: одна линия",
  splitRouteIntoSegments(legacyRoute).length,
  1,
);

// 14. Правила «продолжить»: только последняя прогулка и только свежая.
const now = startTime;
const freshEnd = new Date(now - 60 * 60 * 1000); // час назад
const oldEnd = new Date(now - 4 * 60 * 60 * 1000); // четыре часа назад
const olderExpedition = { id: 1, endTime: freshEnd };
const newerExpedition = { id: 2, endTime: freshEnd };

check(
  "продолжить: последняя и свежая",
  isResumableExpedition(newerExpedition, [olderExpedition, newerExpedition], now),
  "true",
);
check(
  "продолжить: не последняя",
  isResumableExpedition(olderExpedition, [olderExpedition, newerExpedition], now),
  "false",
);
check(
  "продолжить: старше трёх часов",
  isResumableExpedition({ id: 2, endTime: oldEnd }, [{ id: 2, endTime: oldEnd }], now),
  "false",
);
check(
  "продолжить: ровно на границе окна",
  isResumableExpedition(
    { id: 2, endTime: new Date(now - RESUME_WINDOW_MS) },
    [{ id: 2 }],
    now,
  ),
  "true",
);
check(
  "продолжить: незавершённую не предлагаем",
  isResumableExpedition({ id: 2, endTime: null }, [{ id: 2 }], now),
  "false",
);

console.log(results.join("\n"));

if (results.some((line) => line.startsWith("FAIL"))) {
  process.exitCode = 1;
}
