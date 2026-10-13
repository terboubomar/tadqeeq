import { describe, expect, test } from "bun:test";

import { buildHourlyGrid, orderHour, weekdayOf } from "./hourly";

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
  });

  test("returns null when the row has no time", () => {
    expect(orderHour("hungerstation", { "Order received at": "2026-10-06" })).toBeNull();
    expect(orderHour("jahez", { Date: 46301 })).toBeNull();
    expect(orderHour("keeta", {})).toBeNull();
    expect(orderHour("keeta", null)).toBeNull();
  });
});

describe("buildHourlyGrid", () => {
  test("sums sales and orders by weekday and hour, leaving out cancelled HungerStation orders", () => {
    const grid = buildHourlyGrid("hungerstation", [
      { business_date: "2026-10-06", status: "Delivered", gross_sales: "50.5", raw_data: { "Order received at": "2026-10-06 00:03" } },
      { business_date: "2026-10-06", status: "Delivered", gross_sales: 40, raw_data: { "Order received at": "2026-10-06 00:40" } },
      { business_date: "2026-10-06", status: "Cancelled", gross_sales: 0, raw_data: { "Order received at": "2026-10-06 00:50" } },
      { business_date: "2026-10-07", status: "Delivered", gross_sales: 10, raw_data: { "Order received at": "2026-10-07" } },
    ]);
    const tuesday = weekdayOf("2026-10-06");
    expect(tuesday).toBe(2);
    expect(grid.cells[tuesday]![0]).toEqual({ sales: 90.5, orders: 2 });
    expect(grid.untimedOrders).toBe(1);
    expect(grid.untimedSales).toBe(10);
    expect(grid.weekdayDays[tuesday]).toBe(1);
    expect(grid.weekdayDays[3]).toBe(1);
  });
});
