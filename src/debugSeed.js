/**
 * Генератор тестовых прогулок для проверки архива на большом списке.
 * Данные помечены `isDebug` и удаляются при следующем запуске приложения.
 * Никаких фото и находок: проверяем строки, а не карту.
 */

export const DEBUG_LIMIT = 200;

const TITLE_VARIANTS = [
  "Проверка архива",
  "Короткая прогулка",
  "Тест маршрута",
  "Прогулка вдоль набережной",
  "Тест длинного названия: прогулка вдоль набережной и обратно",
  "Проверка обрезки названия в строке архива",
];

const GOAL_VARIANTS = [
  "Проверить список",
  "Найти что-нибудь интересное",
  "Проверить, как выглядит длинная цель в строке архива",
  "Пройти маршрут и вернуться",
];

function createRandom(seed) {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * Возвращает экспедиции без id (для `bulkAdd`), отсортированные от старых
 * к новым: тогда порядок `id` совпадает с порядком дат в архиве.
 */
export function buildDebugExpeditions({
  count,
  seed = 1,
  now = Date.now(),
  existingCount = 0,
}) {
  const random = createRandom(seed);
  const items = [];

  for (let index = 0; index < count; index += 1) {
    const daysAgo = 1 + Math.floor(random() * 59);
    const extraHours = Math.floor(random() * 6);
    const durationMinutes = 20 + Math.floor(random() * 281);
    const startMs =
      now - daysAgo * 24 * 60 * 60 * 1000 - extraHours * 60 * 60 * 1000;

    items.push({
      startMs,
      durationMinutes,
      title: TITLE_VARIANTS[Math.floor(random() * TITLE_VARIANTS.length)],
      goal: GOAL_VARIANTS[Math.floor(random() * GOAL_VARIANTS.length)],
    });
  }

  items.sort((left, right) => left.startMs - right.startMs);

  return items.map((item, index) => ({
    startTime: new Date(item.startMs),
    endTime: new Date(item.startMs + item.durationMinutes * 60 * 1000),
    pausedAt: null,
    path: [],
    title: `ТЕСТ ${String(existingCount + index + 1).padStart(2, "0")} · ${item.title}`,
    goal: item.goal,
    isDebug: true,
  }));
}
