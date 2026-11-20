import { db } from "./db";

// Журнал не должен расти бесконечно: держим последние 800 событий.
const MAX_ROWS = 800;

/**
 * Пишет событие в журнал диагностики. Ошибка записи не должна ломать прогулку,
 * поэтому всё глушится в console.warn.
 */
export async function logDiagnostic(type, details = {}) {
  try {
    await db.diagnostics.add({ time: new Date(), type, details });

    const count = await db.diagnostics.count();

    if (count > MAX_ROWS) {
      const keys = await db.diagnostics
        .orderBy("id")
        .limit(count - MAX_ROWS)
        .primaryKeys();

      if (keys.length > 0) {
        await db.diagnostics.bulkDelete(keys);
      }
    }
  } catch (error) {
    console.warn("Диагностика не записалась:", error);
  }
}
