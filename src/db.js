import Dexie from "dexie";

export const db = new Dexie("ExplorerDB");

db.version(1).stores({
  expeditions: "++id, startTime, endTime",
  findings: "++id, expeditionId, timeStamp",
});

export async function clearAllData() {
  await db.expeditions.clear();
  await db.findings.clear();
}

export async function exportAllData() {
  const expeditions = await db.expeditions.toArray();
  const findings = await db.findings.toArray();

  return {
    expeditions,
    findings,
    varsion: 1,
  };
}

// @param {Object} data

export async function importAllData(data) {
  if (!data.expeditions || !data.findings) {
    throw new Error("Неверный формат файла бэкапа");
  }

  await clearAllData();

  await db.expeditions.bulkPut(data.expeditions);
  await db.findings.bulkPut(data.findings);
}
