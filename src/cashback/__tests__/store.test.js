import AsyncStorage from "@react-native-async-storage/async-storage";

import { __resetStore, ensureMigrated, getState, KEYS, updateState, withResult } from "../store";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetStore();
});

const v0 = [{ id: 1, name: "Card", categories: [{ name: "A", percentage: 10 }], transactions: [{ id: 2, amount: 100, category: "A" }] }];

test("migration runs once and keeps a backup of the original data", async () => {
  await AsyncStorage.setItem(KEYS.groups, JSON.stringify(v0));
  expect(await ensureMigrated()).toEqual({ migrated: true, count: 1 });
  expect(await AsyncStorage.getItem(KEYS.backupV0)).toBe(JSON.stringify(v0));
  expect(await AsyncStorage.getItem(KEYS.schemaVersion)).toBe("1");
  const groups = JSON.parse(await AsyncStorage.getItem(KEYS.groups));
  expect(groups[0].transactions[0].categoryId).toBe("cat-a");
  expect(await ensureMigrated()).toEqual({ migrated: false });
});

test("fresh install loads defaults", async () => {
  const s = await getState();
  expect(s).toMatchObject({ groups: [], templates: [], candidates: [] });
  expect(s.settings.captureEnabled).toBe(false);
  expect(s.settings.rawTextRetentionDays).toBe(30);
});

test("updates are serialised and only changed keys are written", async () => {
  await getState();
  const spy = AsyncStorage.multiSet; // already a jest.fn in the mock
  spy.mockClear();
  await Promise.all([
    updateState((s) => ({ ...s, groups: [...s.groups, { id: "a" }] })),
    updateState((s) => ({ ...s, groups: [...s.groups, { id: "b" }] })),
  ]);
  expect((await getState()).groups.map((g) => g.id)).toEqual(["a", "b"]);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls.every(([pairs]) => pairs.length === 1 && pairs[0][0] === KEYS.groups)).toBe(true);
});

test("withResult returns a value; a throwing updater saves nothing", async () => {
  const value = await updateState((s) => withResult({ ...s, templates: [{ id: "t" }] }, 42));
  expect(value).toBe(42);
  await expect(updateState(() => { throw new Error("nope"); })).rejects.toThrow("nope");
  expect((await getState()).templates).toHaveLength(1);
  // The queue keeps working after a failure.
  await updateState((s) => ({ ...s, templates: [] }));
  expect((await getState()).templates).toHaveLength(0);
});
