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

console.log(results.join("\n"));

if (results.some((line) => line.startsWith("FAIL"))) {
  process.exitCode = 1;
}
