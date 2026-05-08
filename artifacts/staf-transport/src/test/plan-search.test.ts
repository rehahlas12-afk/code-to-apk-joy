import { beforeEach, describe, expect, it } from "vitest";
import { parseOcrText } from "../lib/ocr";
import { activatePlan, getStores, savePlan, searchStore } from "../lib/store";

describe("plan search", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the active selected plan for search results", () => {
    savePlan({
      id: "plan-a",
      imageData: "a",
      stores: [{ number: "1111", travee: "101", zone: "Zone 1" }],
      date: "01/01/2026",
      time: "08:00:00",
    });

    savePlan({
      id: "plan-b",
      imageData: "b",
      stores: [{ number: "2222", travee: "202", zone: "Zone 1" }],
      date: "02/01/2026",
      time: "08:30:00",
    });

    expect(searchStore("1111")).toBeNull();
    expect(searchStore("2222")?.store.travee).toBe("202");

    activatePlan("plan-a");

    expect(searchStore("1111")?.store.travee).toBe("101");
    expect(searchStore("2222")).toBeNull();
  });

  it("does not fall back to an older analyzed plan when the selected plan has no stores", () => {
    savePlan({
      id: "plan-a",
      imageData: "a",
      stores: [{ number: "1111", travee: "101", zone: "Zone 1" }],
      date: "01/01/2026",
      time: "08:00:00",
    });

    savePlan({
      id: "plan-b",
      imageData: "b",
      stores: [],
      date: "02/01/2026",
      time: "08:30:00",
    });

    activatePlan("plan-b");

    expect(searchStore("1111")).toBeNull();
  });

  it("parses OCR text with split digits and common OCR confusions", () => {
    const stores = parseOcrText(`
      ZONE 1
      306 10 892 8214
      DEB4 9O83 7879
      CRAFT
      94 7859
    `);

    expect(stores).toEqual(
      expect.arrayContaining([
        { number: "10892", travee: "306", zone: "Zone 1" },
        { number: "8214", travee: "306", zone: "Zone 1" },
        { number: "9083", travee: "DEB4", zone: "Débord" },
        { number: "7879", travee: "DEB4", zone: "Débord" },
        { number: "7859", travee: "94", zone: "Craft" },
      ]),
    );
  });

  it("does not load demo stores when the app has no work plan", () => {
    expect(getStores()).toEqual([]);
    expect(searchStore("8486")).toBeNull();
  });

  it("keeps 86 Débord separate from 86 Craft", () => {
    const stores = parseOcrText(`
      86 1111
      86 CRAFT 2222
      CRAFT
      87 3333
    `);

    expect(stores).toEqual(
      expect.arrayContaining([
        { number: "1111", travee: "86", zone: "Débord" },
        { number: "2222", travee: "86", zone: "Craft" },
        { number: "3333", travee: "87", zone: "Craft" },
      ]),
    );
  });
});