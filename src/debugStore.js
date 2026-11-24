import { db } from "./db";
import { buildDebugExpeditions, DEBUG_LIMIT } from "./debugSeed";

/** Сколько тестовых прогулок сейчас в базе. */
export async function countDebugData() {
  const rows = await db.expeditions.toArray();
  return rows.filter((row) => row.isDebug === true).length;
}

async function deleteDebugRows(debugExpeditions) {
  if (debugExpeditions.length === 0) {
    return 0;
  }

  const ids = debugExpeditions.map((row) => row.id);

  await db.transaction("rw", db.expeditions, db.findings, async () => {
    const debugFindings = await db.findings
      .filter(
        (row) => row.isDebug === true || ids.includes(row.expeditionId),
      )
      .toArray();

    if (debugFindings.length > 0) {
      await db.findings.bulkDelete(debugFindings.map((row) => row.id));
    }

    await db.expeditions.bulkDelete(ids);
  });

  return debugExpeditions.length;
}

/** Добавляет тестовые строки. Возвращает, сколько реально добавилось. */
export async function seedDebugData(count = 25) {
  const current = await countDebugData();
  const room = Math.max(0, DEBUG_LIMIT - current);
  const toAdd = Math.min(count, room);

  if (toAdd === 0) {
    return { added: 0, total: current, limitReached: true };
  }

  const expeditions = buildDebugExpeditions({
    count: toAdd,
    existingCount: current,
    seed: current + 1,
  });

  await db.expeditions.bulkAdd(expeditions);

  return { added: toAdd, total: current + toAdd, limitReached: false };
}

/** Удаляет все тестовые прогулки (и их находки, если когда-нибудь появятся). */
export async function removeDebugData() {
  const debugExpeditions = await db.expeditions
    .filter((row) => row.isDebug === true)
    .toArray();

  return deleteDebugRows(debugExpeditions);
}

/**
 * Читает архив один раз и попутно убирает тестовые строки.
 * Так запуск не читает базу дважды, а тесты не попадают в UI.
 */
export async function loadExpeditionsWithoutDebug() {
  const all = await db.expeditions.orderBy("id").reverse().toArray();
  const debug = all.filter((row) => row.isDebug === true);

  if (debug.length > 0) {
    try {
      await deleteDebugRows(debug);
    } catch (error) {
      console.error("Не удалось удалить тестовые данные:", error);
    }
  }

  return all.filter((row) => row.isDebug !== true);
}

