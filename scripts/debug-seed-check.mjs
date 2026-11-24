/**
 * Проверка генератора тестовых прогулок: `npm run check:seed`.
 * Без браузера и IndexedDB — только чистые данные.
 */
import { buildDebugExpeditions, DEBUG_LIMIT } from "../src/debugSeed.js";
import { RESUME_WINDOW_MS } from "../src/utils.js";

const results = [];
const check = (name, actual, expected) => {
  const isOk = String(actual) === String(expected);
  results.push(
    `${isOk ? "OK  " : "FAIL"} ${name}: ${actual}${isOk ? "" : ` (ожидалось ${expected})`}`,
  );
};

const now = 1_800_000_000_000;
const items = buildDebugExpeditions({ count: 25, now, seed: 7 });

check("тестовых: 25", items.length, 25);
check(
  "все помечены isDebug",
  items.every((item) => item.isDebug === true),
  true,
);
check(
  "у всех есть даты",
  items.every(
    (item) => item.startTime instanceof Date && item.endTime instanceof Date,
  ),
  true,
);
check(
  "все старше окна «Продолжить»",
  items.every((item) => now - item.endTime.getTime() > RESUME_WINDOW_MS),
  true,
);
check(
  "пути пустые",
  items.every((item) => Array.isArray(item.path) && item.path.length === 0),
  true,
);
check(
  "цели непустые",
  items.every((item) => typeof item.goal === "string" && item.goal.length > 0),
  true,
);
check("названия уникальны", new Set(items.map((item) => item.title)).size, 25);
check(
  "есть длинное название",
  items.some((item) => item.title.length > 40),
  true,
);
check(
  "порядок по времени",
  items.every(
    (item, index) =>
      index === 0 || items[index - 1].startTime <= item.startTime,
  ),
  true,
);
check("предел 200", DEBUG_LIMIT, 200);
check(
  "генератор детерминирован",
  JSON.stringify(buildDebugExpeditions({ count: 3, now, seed: 7 })) ===
    JSON.stringify(buildDebugExpeditions({ count: 3, now, seed: 7 })),
  true,
);

console.log(results.join("\n"));

if (results.some((result) => result.startsWith("FAIL"))) {
  process.exitCode = 1;
}
