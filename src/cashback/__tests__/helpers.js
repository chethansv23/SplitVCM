import { buildTemplate, createCycleGroup } from "../templates";
import { DEFAULT_SETTINGS } from "../inbox";

export const NOW = new Date("2026-09-25T06:00:00.000Z");

// State with an HSBC Live+ card (suffix 5678) and its open Sep–Oct cycle.
export const liveplusState = () => {
  const template = { ...buildTemplate("hsbc-live-plus", {}, NOW), cardLastFour: "5678" };
  const group = createCycleGroup(template, "2026-09-14", NOW);
  return {
    template,
    group,
    state: { groups: [group], templates: [template], candidates: [], settings: { ...DEFAULT_SETTINGS } },
  };
};

export const hsbcAlert = (merchant, amount = 899, when = "14 Sep 2026 at 18:05", card = "5678") => ({
  text: `Your HSBC Credit Card ending ${card} has been used for INR ${amount}.00 at ${merchant} on ${when}. Available credit limit INR 1,20,000.`,
  sourceApp: "com.google.android.apps.messaging",
  postedAt: "2026-09-14T12:40:00.000Z",
});
