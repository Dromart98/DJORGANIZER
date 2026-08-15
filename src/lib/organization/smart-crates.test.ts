import { describe, expect, it } from "vitest";
import {
  parseSmartCrateRules,
  parseSmartCrateRulesJson,
  SMART_CRATE_MAX_CONDITIONS,
  type SmartCrateRules,
} from "./smart-crates";

const rules: SmartCrateRules = {
  version: 1,
  logic: "and",
  groups: [
    {
      logic: "and",
      conditions: [
        { field: "genre", operator: "equals", value: "House" },
        { field: "bpm-range", operator: "between", value: 120, value2: 130 },
      ],
    },
    {
      logic: "or",
      conditions: [
        { field: "camelot", operator: "equals", value: "8A" },
        { field: "energy", operator: "gte", value: 7 },
      ],
    },
  ],
};

describe("smart crate rules", () => {
  it("accepts nested AND/OR groups with musical fields", () => {
    expect(parseSmartCrateRules(rules).success).toBe(true);
    expect(parseSmartCrateRulesJson(JSON.stringify(rules)).success).toBe(true);
  });

  it("accepts tag conditions using persistent tag ids", () => {
    expect(
      parseSmartCrateRules({
        version: 1,
        logic: "or",
        groups: [
          {
            logic: "and",
            conditions: [
              {
                field: "tag",
                operator: "has",
                value: "00000000-0000-4000-8000-000000000001",
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects incompatible operators and invalid ranges", () => {
    expect(
      parseSmartCrateRules({
        version: 1,
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions: [{ field: "genre", operator: "gte", value: "House" }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      parseSmartCrateRules({
        version: 1,
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions: [
              { field: "bpm-range", operator: "between", value: 130, value2: 120 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects empty rules and excessive condition counts", () => {
    expect(parseSmartCrateRules({ version: 1, logic: "and", groups: [] }).success).toBe(false);
    expect(
      parseSmartCrateRules({
        version: 1,
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions: Array.from({ length: SMART_CRATE_MAX_CONDITIONS + 1 }, () => ({
              field: "rating",
              operator: "gte",
              value: 3,
            })),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("fails closed for malformed JSON", () => {
    expect(parseSmartCrateRulesJson("{nope").success).toBe(false);
  });
});
