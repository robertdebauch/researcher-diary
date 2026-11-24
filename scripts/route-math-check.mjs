/**
 * Проверка математики маршрута без тест-фреймворка: `npm run check:route`.
 * Фиксирует инварианты Этапа 2: таймстампы в точках, честная скорость,
 * троттлинг-совместимый формат, «телепорты» отдельными сегментами.
 */
import {
  appendRoutePoint,
  calculateDistance,
  calculateRouteStats,
  canPersistRoute,
  createRoutePoint,
  filterImplausiblePoints,
  formatGapDuration,
  getGapConnections,
  getGapReason,
  getRouteBreaks,
  isResumableExpedition,
  RESUME_WINDOW_MS,
  simplifyPath,
  splitRouteIntoRuns,
  splitRouteIntoSegments,
  toLeafletPositions,
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
check("формат точки: пять полей", routeWithOnePoint[0].length, 5);
check("формат точки: время во втором индексе", typeof routeWithOnePoint[0][2], "number");
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

// 7. Редкие точки: 5 минут между точками и 100 м смещения — это ходьба 1.2 км/ч.
// Раньше такие отрезки выбрасывались по порогу 30 с, и фоновая запись исчезала
// из дистанции целиком. Осознанная пауза отсекается флагом, а не временем.
const sparseRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(100), 37.61, startTime + 300000),
];
const sparseStats = calculateRouteStats(sparseRoute);
check("редкие точки: дистанция (км)", sparseStats.distanceKm, "0.10");
check("редкие точки: время (с)", sparseStats.movingMs / 1000, "300");

// 7б. Та же пара точек, но с флагом ручной паузы — не считается вообще.
const flaggedSparseRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(100), 37.61, startTime + 300000, true),
];
const flaggedSparseStats = calculateRouteStats(flaggedSparseRoute);
check("флаг паузы: дистанция (км)", flaggedSparseStats.distanceKm, "0.00");
check("флаг паузы: время (с)", flaggedSparseStats.movingMs / 1000, "0");

// 7в. Простой: 29 м за три часа (как в зале на полевом тесте) — не движение.
const idleRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(29), 37.61, startTime + 3 * 60 * 60 * 1000),
];
const idleStats = calculateRouteStats(idleRoute);
check("простой 3 ч: пешком (км)", idleStats.distanceKm, "0.00");
check("простой 3 ч: транспорт (км)", idleStats.transportKm, "0.00");

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

// 8б. Транспорт: 1 км за 2 минуты (30 км/ч) — не пешая дистанция, а «транспорт».
const busRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(1000), 37.61, startTime + 120000),
];
const busStats = calculateRouteStats(busRoute);
check("автобус: пешком (км)", busStats.distanceKm, "0.00");
check("автобус: транспорт (км)", busStats.transportKm, "1.00");
check("автобус: транспорт время (с)", busStats.transportMs / 1000, "120");

// 8в. Граница транспорта (12 км/ч): 10 км/ч — пешком, 20 км/ч — транспорт.
const slowRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(100), 37.61, startTime + 36000),
];
const fastRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(55.75 + metersToLatitude(100), 37.61, startTime + 18000),
];
check("10 км/ч: пешком (км)", calculateRouteStats(slowRoute).distanceKm, "0.10");
check("10 км/ч: транспорт (км)", calculateRouteStats(slowRoute).transportKm, "0.00");
check("20 км/ч: пешком (км)", calculateRouteStats(fastRoute).distanceKm, "0.00");
check("20 км/ч: транспорт (км)", calculateRouteStats(fastRoute).transportKm, "0.10");

// 8г. Транспорт с длинным разрывом: 9 км за 43 минуты (12.6 км/ч) считаем,
// потому что для транспорта лимит разрыва — час, а не полчаса.
const longBusRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(
    55.75 + metersToLatitude(9000),
    37.61,
    startTime + 43 * 60 * 1000,
  ),
];
check(
  "автобус 43 мин: транспорт (км)",
  calculateRouteStats(longBusRoute).transportKm,
  "8.99",
);
check(
  "автобус 43 мин: пешком (км)",
  calculateRouteStats(longBusRoute).distanceKm,
  "0.00",
);

// 8д. Тот же разрыв, но пешком (5 км за 43 минуты, 7 км/ч) — не считаем:
// для ходьбы лимит остаётся 30 минут.
const longWalkRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(
    55.75 + metersToLatitude(5000),
    37.61,
    startTime + 43 * 60 * 1000,
  ),
];
check(
  "долгий разрыв, ходьба: пешком (км)",
  calculateRouteStats(longWalkRoute).distanceKm,
  "0.00",
);

// 8е. Проверка «паузы» на транспорте — см. после маршрута pauseGapRoute (пункт 11).

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
// Быстрый участок внутри разрыва — это транспорт, а не пешая дистанция.
check(
  "пауза: транспорт внутри разрыва (км)",
  calculateRouteStats(pauseGapRoute).transportKm,
  "1.27",
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

// 15. Разрыв по флагу: ручная пауза рвёт линию даже при коротком интервале.
const flaggedRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(
    55.75 + metersToLatitude(7),
    37.61,
    startTime + 5000,
    true,
  ),
];
check("флаг: точка помечена", flaggedRoute[1][3], 1);
check(
  "флаг: короткая пауза рвёт линию",
  splitRouteIntoSegments(flaggedRoute).length,
  2,
);

const flaggedBreaks = getRouteBreaks(flaggedRoute);
check("флаг: разрыв найден", flaggedBreaks.length, 1);
check("флаг: это пауза", flaggedBreaks[0]?.isPause, "true");
check("флаг: длительность из точек (с)", flaggedBreaks[0]?.durationMs / 1000, "5");

// 16. Временной разрыв без флага — «нет данных», а не пауза.
const dataGapBreaks = getRouteBreaks(pauseGapRoute);
check("без флага: разрывов", dataGapBreaks.length, 1);
check("без флага: это не пауза", dataGapBreaks[0]?.isPause, "false");
check(
  "без флага: длительность (с)",
  dataGapBreaks[0]?.durationMs / 1000,
  "300",
);

// 17. Ровный маршрут и легаси без времени разрывов не имеют.
check("ровный маршрут: разрывов нет", getRouteBreaks(steadyRoute).length, 0);
check("легаси без времени: разрывов нет", getRouteBreaks(legacyRoute).length, 0);

// 18. Подписи разрывов: секунды, минуты, часы.
check("подпись 45 с", formatGapDuration(45000), "45 сек");
check("подпись 12 мин", formatGapDuration(12 * 60 * 1000), "12 мин");
check("подпись 1 ч", formatGapDuration(60 * 60 * 1000), "1 ч");
check("подпись 1 ч 12 мин", formatGapDuration(72 * 60 * 1000), "1 ч 12 мин");

// 19б. Точность хранится пятым полем (для полевой диагностики).
const accuracyRoute = appendRoutePoint([], [55.75, 37.61], { accuracy: 12 });
check("точность записана", accuracyRoute[0][4], 12);
const leafletPositions = toLeafletPositions(flaggedRoute);
check("leaflet: лишние поля обрезаны", leafletPositions[1].length, 2);
check("leaflet: координаты сохранены", leafletPositions[1][0], flaggedRoute[1][0]);

// 20. Прогоны по режимам: пешком → автобус → пешком.
const modeRoute = [];
let modeLatitude = 55.75;
let modeTime = startTime;
modeRoute.push(createRoutePoint(modeLatitude, 37.61, modeTime));
for (let index = 0; index < 3; index += 1) {
  modeLatitude += metersToLatitude(7);
  modeTime += 5000;
  modeRoute.push(createRoutePoint(modeLatitude, 37.61, modeTime));
}
for (let index = 0; index < 3; index += 1) {
  modeLatitude += metersToLatitude(200); // 200 м за 30 с = 24 км/ч
  modeTime += 30000;
  modeRoute.push(createRoutePoint(modeLatitude, 37.61, modeTime));
}
for (let index = 0; index < 3; index += 1) {
  modeLatitude += metersToLatitude(7);
  modeTime += 5000;
  modeRoute.push(createRoutePoint(modeLatitude, 37.61, modeTime));
}

const modeRuns = splitRouteIntoRuns(modeRoute);
check("прогоны: режимы", modeRuns.map((run) => run.mode).join(","), "walk,transport,walk");
check("прогоны: количество", modeRuns.length, 3);
check(
  "прогоны: граница 12 км/ч",
  splitRouteIntoRuns([
    createRoutePoint(55.75, 37.61, startTime),
    createRoutePoint(55.75 + metersToLatitude(100), 37.61, startTime + 30000),
  ])[0].mode,
  "walk",
);
check("прогоны: флаг начинает новый", splitRouteIntoRuns(flaggedRoute).length, 2);
check("прогоны: временной разрыв начинает новый", splitRouteIntoRuns(sparseRoute).length, 2);

// 20б. Короткий быстрый всплеск — это дрожь GPS, линия остаётся пешей.
const blipRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(
    55.75 + metersToLatitude(40),
    37.61,
    startTime + 4000,
  ),
];
check("прогоны: быстрый всплеск не транспорт", splitRouteIntoRuns(blipRoute)[0].mode, "walk");

// 20в. Устойчивый транспорт: 3 км за 3 минуты — синяя линия.
const sustainedBusRoute = [
  createRoutePoint(55.75, 37.61, startTime),
  createRoutePoint(
    55.75 + metersToLatitude(3000),
    37.61,
    startTime + 180000,
  ),
];
check(
  "прогоны: устойчивый транспорт",
  splitRouteIntoRuns(sustainedBusRoute).at(-1).mode,
  "transport",
);

// 21. Причина разрыва по журналу диагностики.
const gapStart = startTime;
const gapEnd = startTime + 10 * 60 * 1000;
const screenOffLog = [
  {
    time: new Date(gapStart + 1000),
    type: "visibility",
    details: { state: "hidden" },
  },
  { time: new Date(gapStart + 2000), type: "freeze", details: {} },
];
check(
  "разрыв: экран был выключен",
  getGapReason(gapStart, gapEnd, screenOffLog),
  "screen-off",
);
check(
  "разрыв: приложение закрыто",
  getGapReason(gapStart, gapEnd, [
    { time: new Date(gapStart + 1000), type: "pagehide", details: {} },
  ]),
  "app-closed",
);
check("разрыв: журнала нет", getGapReason(gapStart, gapEnd, []), "unknown");
check(
  "разрыв: продолжение после остановки",
  getGapReason(gapStart, gapEnd, [
    { time: new Date(gapStart + 1000), type: "finish", details: {} },
    {
      time: new Date(gapStart + 2000),
      type: "expedition-resume",
      details: {},
    },
  ]),
  "resumed",
);
check(
  "разрыв: события вне интервала не учитываются",
  getGapReason(gapStart, gapEnd, [
    { time: new Date(gapStart - 5000), type: "freeze", details: {} },
  ]),
  "unknown",
);

// 22. Пустой state не должен затирать сохранённый маршрут.
check("пустой маршрут не пишем в базу", canPersistRoute([]), false);
check("null не считаем маршрутом", canPersistRoute(null), false);
check(
  "непустой маршрут пишем",
  canPersistRoute([[58, 56, 1, 0, 5]]),
  true,
);

// 23. Транспорт, попавший в разрыв (экран был выключен), остаётся транспортом
// в статистике, но линией не рисуется: между точками нет наблюдений.
const gapRideStart = [58.0089969, 56.225668, startTime, 0, 4];
const gapRideEnd = [57.999234, 56.1915505, startTime + 536000, 0, 24.5];
const gapRideStats = calculateRouteStats([gapRideStart, gapRideEnd]);
check(
  "транспорт в разрыве учтён в статистике",
  Number(gapRideStats.transportKm) > 2,
  true,
);
check("транспорт в разрыве не даёт пеших км", gapRideStats.distanceKm, "0.00");
check(
  "транспорт в разрыве не даёт рисуемого прогона",
  splitRouteIntoRuns([gapRideStart, gapRideEnd]).every(
    (run) => run.points.length < 2,
  ),
  true,
);

// 24. Связки между точками разрыва.
const linkStart = createRoutePoint(58.0089969, 56.225668, startTime);
const linkEnd = createRoutePoint(
  57.999234,
  56.1915505,
  startTime + 536000,
);
const rideLinks = getGapConnections([linkStart, linkEnd]);
check("связка через разрыв: одна", rideLinks.length, 1);
check("связка через разрыв: транспорт", rideLinks[0].mode, "transport");
check(
  "связка через разрыв: расстояние больше 2 км",
  rideLinks[0].distanceMeters > 2000,
  true,
);

const pauseStart = createRoutePoint(58.0, 56.0, startTime);
const pauseEnd = createRoutePoint(58.0018, 56.0, startTime + 600000, true);
const pauseLinks = getGapConnections([pauseStart, pauseEnd]);
check("связка паузы: одна", pauseLinks.length, 1);
check("связка паузы: помечена", pauseLinks[0].isPause, true);

const stillEnd = createRoutePoint(58.0, 56.0, startTime + 600000, true);
check(
  "стоя на паузе связки нет",
  getGapConnections([pauseStart, stillEnd]).length,
  0,
);

const teleportEnd = createRoutePoint(58.1, 56.0, startTime + 60000);
check(
  "телепорт не соединяем",
  getGapConnections([pauseStart, teleportEnd]).length,
  0,
);

check(
  "без разрыва связок нет",
  getGapConnections([steadyPoint(0), steadyPoint(1)]).length,
  0,
);

console.log(results.join("\n"));

if (results.some((line) => line.startsWith("FAIL"))) {
  process.exitCode = 1;
}
