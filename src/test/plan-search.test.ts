import { beforeEach, describe, expect, it } from "vitest";
import { parseOcrText, reconstructTextFromGeometry } from "../lib/ocr";
import { activatePlan, getStores, savePlan, searchStore, suggestStores } from "../lib/store";

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

  it("does not invent stores by merging quantities with the next store", () => {
    const stores = parseOcrText(`
      201 5H00 2971 M 13 6317 F 6 8485 F 6 DEB5
      401 5H00 7878 F 4 9668 F 5 11843 F 9 DEB
      306 5H00 10 892 8214 S 23
    `);

    expect(stores).toEqual(
      expect.arrayContaining([
        { number: "2971", travee: "201", zone: "Zone 1" },
        { number: "6317", travee: "201", zone: "Zone 1" },
        { number: "8485", travee: "201", zone: "Zone 1" },
        { number: "7878", travee: "401", zone: "Zone 1" },
        { number: "9668", travee: "401", zone: "Zone 1" },
        { number: "11843", travee: "401", zone: "Zone 1" },
        { number: "10892", travee: "306", zone: "Zone 1" },
        { number: "8214", travee: "306", zone: "Zone 1" },
      ]),
    );
    expect(stores.map((store) => store.number)).not.toEqual(
      expect.arrayContaining(["6111", "1615", "68485", "49668", "511843"]),
    );
  });

  it("does not load demo stores when the app has no work plan", () => {
    expect(getStores()).toEqual([]);
    expect(searchStore("8486")).toBeNull();
  });

  it("keeps short numeric suggestions strict", () => {
    savePlan({
      id: "plan-a",
      imageData: "a",
      stores: [
        { number: "1168", travee: "99", zone: "Zone 1" },
        { number: "8214", travee: "306", zone: "Zone 1" },
        { number: "8485", travee: "201", zone: "Zone 1" },
      ],
      date: "01/01/2026",
      time: "08:00:00",
    });

    expect(suggestStores("8").map((store) => store.number)).toEqual(["8214", "8485"]);
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

  it("reconstructs OCR lines from word geometry when text blocks are broken", () => {
    const geometricText = reconstructTextFromGeometry([
      { text: "ZONE", bbox: { x0: 10, y0: 10, x1: 45, y1: 24 } },
      { text: "1", bbox: { x0: 52, y0: 10, x1: 60, y1: 24 } },
      { text: "306", bbox: { x0: 10, y0: 42, x1: 34, y1: 57 } },
      { text: "10892", bbox: { x0: 100, y0: 41, x1: 146, y1: 57 } },
      { text: "8214", bbox: { x0: 180, y0: 43, x1: 220, y1: 58 } },
      { text: "DEB4", bbox: { x0: 10, y0: 78, x1: 48, y1: 94 } },
      { text: "9O83", bbox: { x0: 100, y0: 78, x1: 138, y1: 94 } },
    ]);
    const stores = parseOcrText(geometricText);

    expect(stores).toEqual(
      expect.arrayContaining([
        { number: "10892", travee: "306", zone: "Zone 1" },
        { number: "8214", travee: "306", zone: "Zone 1" },
        { number: "9083", travee: "DEB4", zone: "Débord" },
      ]),
    );
  });
});