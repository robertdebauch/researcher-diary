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
