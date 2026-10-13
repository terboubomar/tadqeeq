import { describe, expect, test } from "bun:test";

import { buildHourlyGrid, hourlyColumns, orderHour, weekdayOf } from "./hourly";

describe("orderHour", () => {
  test("reads each platform's time column", () => {
    expect(orderHour("hungerstation", { "Order received at": "2026-10-06 00:03" })).toBe(0);
    expect(orderHour("hungerstation", { "Order received at": "2026-10-06 23:58" })).toBe(23);
    expect(orderHour("keeta", { "Order time": "2026-10-06 14:20:11" })).toBe(14);
    expect(orderHour("jahez", { Date: "06/10/2026 11:57:25 PM" })).toBe(23);
    expect(orderHour("jahez", { Date: "06/10/2026 12:10:00 AM" })).toBe(0);
    expect(orderHour("jahez", { Date: "06/10/2026 12:10:00 PM" })).toBe(12);
  });

  test("falls back to Keeta's Date column and reads spreadsheet dates", () => {
    expect(orderHour("keeta", { "Order time": null, Date: "2026-10-06T19:45:00.000Z" })).toBe(19);
    expect(orderHour("keeta", { "Order time": 46301.75 })).toBe(18);
    expect(orderHour("keeta", { "Order time": "46301.75" })).toBe(18);
  });

  test("returns null when the row has no time", () => {
    expect(orderHour("hungerstation", { "Order received at": "2026-10-06" })).toBeNull();
    expect(orderHour("jahez", { Date: 46301 })).toBeNull();
    expect(orderHour("keeta", {})).toBeNull();
    expect(orderHour("keeta", null)).toBeNull();
  });
});

describe("buildHourlyGrid", () => {
  test("sums sales and orders by date and hour, leaving out cancelled HungerStation orders", () => {
    const grid = buildHourlyGrid("hungerstation", [
      { business_date: "2026-10-06", status: "Delivered", gross_sales: "50.5", raw_data: { "Order received at": "2026-10-06 00:03" } },
      { business_date: "2026-10-06", status: "Delivered", gross_sales: 40, raw_data: { "Order received at": "2026-10-06 00:40" } },
      { business_date: "2026-10-06", status: "Cancelled", gross_sales: 0, raw_data: { "Order received at": "2026-10-06 00:50" } },
      { business_date: "2026-10-07", status: "Delivered", gross_sales: 10, raw_data: { "Order received at": "2026-10-07" } },
    ]);
    expect(grid.days.map((day) => day.date)).toEqual(["2026-10-06", "2026-10-07"]);
    expect(grid.days[0]!.hours[0]).toEqual({ sales: 90.5, orders: 2 });
    expect(grid.untimedOrders).toBe(1);
    expect(grid.untimedSales).toBe(10);
  });
});

describe("hourlyColumns", () => {
  const day = (date: string, sales: number) => ({
    date,
    hours: Array.from({ length: 24 }, (_, hour) => ({ sales: hour === 13 ? sales : 0, orders: hour === 13 ? 1 : 0 })),
  });

  test("keeps one column per date for a week or less", () => {
    const columns = hourlyColumns([day("2026-10-06", 100), day("2026-10-07", 50)]);
    expect(columns.map((c) => [c.date, c.weekday, c.dayCount])).toEqual([
      ["2026-10-06", weekdayOf("2026-10-06"), 1],
      ["2026-10-07", weekdayOf("2026-10-07"), 1],
    ]);
  });

  test("sums longer ranges by weekday", () => {
    const days = Array.from({ length: 14 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, 10));
    const columns = hourlyColumns(days);
    expect(columns).toHaveLength(7);
    expect(columns.every((c) => c.date === null && c.dayCount === 2 && c.hours[13]!.sales === 20)).toBe(true);
  });
});
