import { CURRENT_SCHEMA_VERSION } from "./migration";
import { withComputed } from "./compute";
import { normaliseTemplate } from "./templates";

export const BACKUP_APP_ID = "SplitVCM";

// Exports everything needed to restore the app on another phone. Captured
// alert text is left out unless explicitly requested.
export const exportBackup = (state, { includeCapturedText = false, now = new Date() } = {}) =>
  JSON.stringify(
    {
      app: BACKUP_APP_ID,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      expenseGroups: state.expenseGroups || [],
      cashbackGroups: state.groups,
      cardTemplates: state.templates,
      captureSettings: state.settings,
      candidates: state.candidates.map((c) =>
        includeCapturedText
          ? c
          : {
              ...c,
              rawText: null,
              duplicateSources: (c.duplicateSources || []).map((d) => ({ ...d, rawText: null })),
            }
      ),
    },
    null,
    2
  );

export const parseBackup = (json) => {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("This is not valid JSON.");
  }
  if (!data || data.app !== BACKUP_APP_ID) throw new Error("This is not a SplitVCM backup.");
  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup version ${data.schemaVersion}.`);
  }
  for (const key of ["cashbackGroups", "cardTemplates", "candidates"]) {
    if (!Array.isArray(data[key])) throw new Error(`Backup is missing ${key}.`);
  }
  for (const g of data.cashbackGroups) {
    if (!g.id || !Array.isArray(g.categories) || !Array.isArray(g.transactions)) {
      throw new Error(`Cashback group "${g.name || g.id}" is malformed.`);
    }
  }
  return {
    expenseGroups: Array.isArray(data.expenseGroups) ? data.expenseGroups : [],
    groups: data.cashbackGroups.map(withComputed),
    templates: data.cardTemplates.map(normaliseTemplate),
    candidates: data.candidates,
    settings: data.captureSettings || {},
  };
};
