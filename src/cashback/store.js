import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { DEFAULT_SETTINGS } from "./inbox";
import { CURRENT_SCHEMA_VERSION, migrateGroups } from "./migration";
import { normaliseTemplate } from "./templates";

// Single in-memory copy of cashback state, persisted to AsyncStorage.
// All writes go through `updateState`, which applies updates one at a time,
// so screens never overwrite each other with stale copies.

export const KEYS = {
  groups: "cashbacks", // unchanged from v0 so existing data is picked up
  templates: "cardTemplates",
  candidates: "captureCandidates",
  settings: "captureSettings",
  schemaVersion: "cashbackSchemaVersion",
  backupV0: "cashbacks_backup_v0",
  expenseGroups: "groups",
};

let state = null;
let loading = null;
let queue = Promise.resolve();
const listeners = new Set();

const readJson = async (key, fallback) => {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

// Runs the one-time schema migration. The pre-migration JSON is kept under
// a separate key so it can be restored if something goes wrong.
export const ensureMigrated = async () => {
  const version = Number(await AsyncStorage.getItem(KEYS.schemaVersion)) || 0;
  if (version >= CURRENT_SCHEMA_VERSION) return { migrated: false };
  const raw = await AsyncStorage.getItem(KEYS.groups);
  const groups = raw ? JSON.parse(raw) : [];
  if (raw && !(await AsyncStorage.getItem(KEYS.backupV0))) {
    await AsyncStorage.setItem(KEYS.backupV0, raw);
  }
  const migrated = migrateGroups(groups, version);
  await AsyncStorage.multiSet([
    [KEYS.groups, JSON.stringify(migrated)],
    [KEYS.schemaVersion, String(CURRENT_SCHEMA_VERSION)],
  ]);
  return { migrated: true, count: migrated.length };
};

const load = async () => {
  await ensureMigrated();
  return {
    groups: await readJson(KEYS.groups, []),
    templates: (await readJson(KEYS.templates, [])).map(normaliseTemplate),
    candidates: await readJson(KEYS.candidates, []),
    settings: { ...DEFAULT_SETTINGS, ...(await readJson(KEYS.settings, {})) },
  };
};

export const getState = async () => {
  if (state) return state;
  if (!loading) loading = load().then((s) => (state = s));
  return loading;
};

const persist = async (prev, next) => {
  const pairs = [];
  if (prev.groups !== next.groups) pairs.push([KEYS.groups, JSON.stringify(next.groups)]);
  if (prev.templates !== next.templates) pairs.push([KEYS.templates, JSON.stringify(next.templates)]);
  if (prev.candidates !== next.candidates) pairs.push([KEYS.candidates, JSON.stringify(next.candidates)]);
  if (prev.settings !== next.settings) pairs.push([KEYS.settings, JSON.stringify(next.settings)]);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
};

const RESULT = Symbol("result");

// Lets an updater return a value to the caller alongside the new state.
export const withResult = (nextState, result) => ({ [RESULT]: true, state: nextState, result });

// updater: (state) => newState | withResult(newState, result). If the
// updater throws, nothing is saved and the returned promise rejects.
export const updateState = (updater) => {
  const run = queue.then(async () => {
    const prev = await getState();
    const out = updater(prev);
    const wrapped = Boolean(out && out[RESULT]);
    const next = wrapped ? out.state : out;
    await persist(prev, next);
    state = next;
    listeners.forEach((l) => l(state));
    return wrapped ? out.result : undefined;
  });
  queue = run.catch(() => {});
  return run;
};

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// For tests only.
export const __resetStore = () => {
  state = null;
  loading = null;
  queue = Promise.resolve();
  listeners.clear();
};

export const useCashbackState = () => {
  const [value, setValue] = useState(state);
  useEffect(() => {
    let alive = true;
    getState().then((s) => alive && setValue(s));
    const unsub = subscribe((s) => alive && setValue(s));
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return value;
};

export const readExpenseGroups = () => readJson(KEYS.expenseGroups, []);
export const writeExpenseGroups = (groups) =>
  AsyncStorage.setItem(KEYS.expenseGroups, JSON.stringify(groups));
