import Dexie from "dexie";

export const db = new Dexie("ExplorerDB");

db.version(1).stores({
  expeditions: "++id, startTime, endTime",
  findings: "++id, expeditionId, timeStamp",
});

// v2: настройки (ключ распознавания, согласие, квота) и кэш распознаваний.
db.version(2).stores({
  settings: "key",
  recognitionCache: "hash",
});

// v3: журнал диагностики — что происходило с записью маршрута в поле.
db.version(3).stores({
  diagnostics: "++id, time, type",
});

/** Настройки — простые пары ключ/значение (ключ Gemini, согласие, квота). */
export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

/** Версия формата бэкапа, которую умеет читать текущая сборка. */
const BACKUP_FORMAT_VERSION = 2;

export async function clearAllData() {
  // Одна транзакция: либо очищаем все таблицы, либо не трогаем ничего.
  await db.transaction(
    "rw",
    db.expeditions,
    db.findings,
    db.diagnostics,
    async () => {
      await db.expeditions.clear();
      await db.findings.clear();
      await db.diagnostics.clear();
    },
  );
}

export async function exportAllData() {
  const expeditions = await db.expeditions.toArray();
  const findings = await db.findings.toArray();
  const diagnostics = await db.diagnostics.toArray();

  return {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    expeditions,
    findings,
    diagnostics,
  };
}

export async function importAllData(data) {
  if (!Array.isArray(data?.expeditions) || !Array.isArray(data?.findings)) {
    throw new Error("Неверный формат файла бэкапа");
  }

  // Раньше ключ версии писался с опечаткой ("varsion") — читаем оба варианта.
  const backupVersion = data.version ?? data.varsion ?? 1;

  if (backupVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Бэкап создан более новой версией приложения (формат v${backupVersion}, поддерживается до v${BACKUP_FORMAT_VERSION})`,
    );
  }

  // Всё в одной транзакции: если запись упадёт (квота, битые данные),
  // старые данные не будут стёрты.
  await db.transaction(
    "rw",
    db.expeditions,
    db.findings,
    db.diagnostics,
    async () => {
      await db.expeditions.clear();
      await db.findings.clear();
      await db.diagnostics.clear();
      await db.expeditions.bulkPut(data.expeditions);
      await db.findings.bulkPut(data.findings);

      // Бэкапы версии 1 журнала не содержат — это нормально.
      if (Array.isArray(data.diagnostics)) {
        await db.diagnostics.bulkPut(data.diagnostics);
      }
    },
  );
}

