import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  deleteReportScheduleOnServer,
  listReportSchedulesOnServer,
  saveReportScheduleOnServer,
  sendReportScheduleNowOnServer,
} from "./report-schedules.server";

export const listReportSchedules = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listReportSchedulesOnServer());

export const saveReportSchedule = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(120),
      frequency: z.enum(["monthly", "weekly", "on_upload"]),
      dayOfMonth: z.number().int().min(1).max(28).nullable(),
      weekday: z.number().int().min(0).max(6).nullable(),
      recipients: z.string().max(2000),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => saveReportScheduleOnServer(data));

export const deleteReportSchedule = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => deleteReportScheduleOnServer(data.id));

export const sendReportScheduleNow = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => sendReportScheduleNowOnServer(data.id));
