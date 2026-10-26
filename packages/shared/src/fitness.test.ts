import { describe, expect, it } from "vitest";
import {
  BENCHMARK_FAMILIES,
  BENCHMARKS,
  bestOneRm,
  bookingConsumes,
  BookingPolicySchema,
  cancellationKindAt,
  checkBooking,
  compareScores,
  DEFAULT_BOOKING_POLICY,
  entitlementUsage,
  formatScore,
  isAdultOn,
  parseDuration,
  percentLoad,
  planCovers,
  planExpiresOn,
  scoreValue,
  weeklyStreaks,
  WorkoutBlockInputSchema,
  type BookingCheckInput,
  type EntitlementPlan,
} from "./fitness.ts";

const plan = (
  over: Partial<EntitlementPlan & { id: string }> = {},
): EntitlementPlan & { id: string } => ({
  id: "p1",
  entitlement: "per_week",
  sessions: 3,
  validityDays: null,
  startsOn: "2026-10-01",
  endsOn: null,
  status: "active",
  pausedUntil: null,
  classTeamIds: null,
  ...over,
});

const startsAt = new Date("2026-10-28T18:00:00Z"); // miércoles
const base = (over: Partial<BookingCheckInput> = {}): BookingCheckInput => ({
  now: new Date("2026-10-26T10:00:00Z"),
  startsAt,
  date: "2026-10-28",
  teamId: "wod",
  policy: DEFAULT_BOOKING_POLICY,
  capacity: 16,
  seatsTaken: 10,
  myStatus: null,
  plans: [plan()],
  bookings: [],
  bookedThatDay: 0,
  ...over,
});

describe("reservas", () => {
  it("la política por defecto es válida", () => {
    expect(BookingPolicySchema.parse(DEFAULT_BOOKING_POLICY)).toEqual(DEFAULT_BOOKING_POLICY);
  });

  it("con plaza y tarifa, se reserva", () => {
    const check = checkBooking(base());
    expect(check).toMatchObject({ action: "book", block: null, planId: "p1" });
    expect(check.usage).toMatchObject({ limit: 3, used: 0, remaining: 3 });
  });

  it("respeta la ventana de reserva", () => {
    expect(checkBooking(base({ now: new Date("2026-10-20T10:00:00Z") })).block).toBe(
      "not_open_yet",
    );
    expect(checkBooking(base({ now: new Date("2026-10-28T18:00:00Z") })).block).toBe("closed");
    const closesEarly = { ...DEFAULT_BOOKING_POLICY, closesMinutesBefore: 30 };
    expect(
      checkBooking(base({ policy: closesEarly, now: new Date("2026-10-28T17:45:00Z") })).block,
    ).toBe("closed");
  });

  it("llena: a la espera si el club la tiene, si no, completa", () => {
    expect(checkBooking(base({ seatsTaken: 16 })).action).toBe("waitlist");
    const noWaitlist = { ...DEFAULT_BOOKING_POLICY, waitlist: false };
    expect(checkBooking(base({ seatsTaken: 16, policy: noWaitlist })).block).toBe("full");
  });

  it("no deja reservar dos veces", () => {
    expect(checkBooking(base({ myStatus: "booked" })).block).toBe("already_booked");
    expect(checkBooking(base({ myStatus: "waitlist" })).block).toBe("already_booked");
    // Tras cancelar, se puede volver a reservar.
    expect(checkBooking(base({ myStatus: "cancelled" })).action).toBe("book");
  });

  it("cuenta las sesiones de la semana de la clase, no de hoy", () => {
    const week = [
      { date: "2026-10-26", consumes: true },
      { date: "2026-10-27", consumes: true },
      { date: "2026-10-29", consumes: true },
    ];
    expect(checkBooking(base({ bookings: week })).block).toBe("no_sessions_left");
    // La semana siguiente está libre.
    const nextWeek = base({
      bookings: week,
      date: "2026-11-02",
      startsAt: new Date("2026-11-02T18:00:00Z"),
      now: new Date("2026-10-30T10:00:00Z"),
    });
    expect(checkBooking(nextWeek).action).toBe("book");
    // Lo que no gasta (una cancelación a tiempo) no cuenta.
    const withCancel = week.map((b, i) => (i === 0 ? { ...b, consumes: false } : b));
    expect(checkBooking(base({ bookings: withCancel })).action).toBe("book");
  });

  it("un bono cuenta toda su vida y caduca", () => {
    const pack = plan({
      entitlement: "pack",
      sessions: 2,
      validityDays: 30,
      startsOn: "2026-10-10",
    });
    expect(planExpiresOn(pack)).toBe("2026-11-08");
    const used = [
      { date: "2026-10-12", consumes: true },
      { date: "2026-10-20", consumes: true },
    ];
    expect(checkBooking(base({ plans: [pack], bookings: used })).block).toBe("no_sessions_left");
    expect(
      checkBooking(
        base({
          plans: [pack],
          date: "2026-11-10",
          startsAt: new Date("2026-11-10T18:00:00Z"),
          now: new Date("2026-11-05T10:00:00Z"),
        }),
      ).block,
    ).toBe("plan_expired");
  });

  it("sin tarifa, en pausa o sin incluir la clase, explica por qué", () => {
    expect(checkBooking(base({ plans: [] })).block).toBe("no_plan");
    expect(
      checkBooking(base({ plans: [plan({ status: "paused", pausedUntil: "2026-10-30" })] })).block,
    ).toBe("plan_paused");
    // La pausa ya ha terminado ese día.
    expect(
      checkBooking(base({ plans: [plan({ status: "paused", pausedUntil: "2026-10-27" })] })).action,
    ).toBe("book");
    expect(checkBooking(base({ plans: [plan({ classTeamIds: ["yoga"] })] })).block).toBe(
      "not_covered",
    );
    // Una cuota de socio sin derecho de uso no reserva.
    expect(checkBooking(base({ plans: [plan({ entitlement: "none" })] })).block).toBe("no_plan");
  });

  it("usa la primera tarifa que vale", () => {
    const yogaOnly = plan({ id: "yoga", classTeamIds: ["yoga"] });
    const open = plan({ id: "open", entitlement: "unlimited", sessions: null });
    expect(checkBooking(base({ plans: [yogaOnly, open] })).planId).toBe("open");
  });

  it("respeta el máximo diario", () => {
    const one = { ...DEFAULT_BOOKING_POLICY, maxPerDay: 1 };
    expect(checkBooking(base({ policy: one, bookedThatDay: 1 })).block).toBe("daily_limit");
  });

  it("cancelar: gratis hasta el plazo, tardía después, imposible empezada", () => {
    expect(
      cancellationKindAt(new Date("2026-10-28T15:00:00Z"), startsAt, DEFAULT_BOOKING_POLICY),
    ).toBe("free");
    expect(
      cancellationKindAt(new Date("2026-10-28T16:30:00Z"), startsAt, DEFAULT_BOOKING_POLICY),
    ).toBe("late");
    expect(
      cancellationKindAt(new Date("2026-10-28T18:00:00Z"), startsAt, DEFAULT_BOOKING_POLICY),
    ).toBe("too_late");
  });

  it("qué estados gastan sesión", () => {
    const lenient = { ...DEFAULT_BOOKING_POLICY, lateCancelConsumes: false, noShowConsumes: false };
    expect(bookingConsumes("attended", lenient)).toBe(true);
    expect(bookingConsumes("late_cancel", lenient)).toBe(false);
    expect(bookingConsumes("late_cancel", DEFAULT_BOOKING_POLICY)).toBe(true);
    expect(bookingConsumes("waitlist", DEFAULT_BOOKING_POLICY)).toBe(false);
    expect(bookingConsumes("cancelled", DEFAULT_BOOKING_POLICY)).toBe(false);
  });

  it("el mes natural y el ilimitado", () => {
    const month = plan({ entitlement: "per_month", sessions: 8 });
    const usage = entitlementUsage(month, "2026-10-28", [
      { date: "2026-09-30", consumes: true },
      { date: "2026-10-01", consumes: true },
      { date: "2026-10-31", consumes: true },
    ]);
    expect(usage).toMatchObject({ limit: 8, used: 2, remaining: 6 });
    expect(usage.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(entitlementUsage(plan({ entitlement: "unlimited" }), "2026-10-28", []).remaining).toBe(
      null,
    );
    expect(planCovers(plan(), "2026-09-30", null)).toBe("inactive");
  });
});

describe("marcadores y clasificación", () => {
  it("valores y textos", () => {
    expect(scoreValue("time", { timeSeconds: 527 })).toBe(527);
    expect(scoreValue("rounds_reps", { rounds: 5, reps: 12 })).toBe(5012);
    expect(formatScore("time", { timeSeconds: 527 })).toBe("8:47");
    expect(formatScore("time", { timeSeconds: 3725 })).toBe("1:02:05");
    expect(formatScore("time", { reps: 14 }, false)).toBe("CAP+14");
    expect(formatScore("rounds_reps", { rounds: 5, reps: 12 })).toBe("5+12");
    expect(formatScore("load", { loadKg: 72.5 })).toBe("72,5 kg");
  });

  it("lee tiempos", () => {
    expect(parseDuration("8:47")).toBe(527);
    expect(parseDuration("1:02:05")).toBe(3725);
    expect(parseDuration("8:75")).toBe(null);
    expect(parseDuration("abc")).toBe(null);
  });

  it("ordena por nivel, por tiempo y deja detrás a quien no acabó", () => {
    const rows = [
      { level: "rx" as const, value: 600, completed: true, capReps: 0 },
      { level: "rx" as const, value: 0, completed: false, capReps: 80 },
      { level: "rx" as const, value: 520, completed: true, capReps: 0 },
      { level: "scaled" as const, value: 400, completed: true, capReps: 0 },
      { level: "rx" as const, value: 0, completed: false, capReps: 95 },
      { level: "rx_plus" as const, value: 700, completed: true, capReps: 0 },
    ];
    const sorted = [...rows].sort((a, b) => compareScores("time", a, b));
    expect(sorted.map((r) => `${r.level}:${r.completed ? r.value : `cap${r.capReps}`}`)).toEqual([
      "rx_plus:700",
      "rx:520",
      "rx:600",
      "rx:cap95",
      "rx:cap80",
      "scaled:400",
    ]);
    const amrap = [
      { level: "rx" as const, value: 5012, completed: true, capReps: 0 },
      { level: "rx" as const, value: 6003, completed: true, capReps: 0 },
    ].sort((a, b) => compareScores("rounds_reps", a, b));
    expect(amrap[0]!.value).toBe(6003);
  });

  it("un porcentaje necesita su movimiento", () => {
    const ok = WorkoutBlockInputSchema.safeParse({
      kind: "strength",
      title: "Back squat",
      scoreType: "load",
      movementCode: "back_squat",
      percent: 75,
    });
    expect(ok.success).toBe(true);
    const bad = WorkoutBlockInputSchema.safeParse({
      kind: "strength",
      title: "Back squat",
      scoreType: "load",
      percent: 75,
    });
    expect(bad.success).toBe(false);
  });
});

describe("cargas", () => {
  it("calcula los kilos de un porcentaje redondeados a medio kilo", () => {
    expect(percentLoad(95, 75)).toBe(71.5);
    expect(percentLoad(80, 60)).toBe(48);
  });

  it("estima la 1RM si solo hay máximas a más repeticiones", () => {
    expect(bestOneRm([{ reps: 1, loadKg: 100 }])).toEqual({ kg: 100, estimated: false });
    expect(bestOneRm([{ reps: 5, loadKg: 90 }])).toEqual({ kg: 105, estimated: true });
    // La real manda si iguala a la estimada.
    expect(
      bestOneRm([
        { reps: 3, loadKg: 100 },
        { reps: 1, loadKg: 110 },
      ]),
    ).toEqual({
      kg: 110,
      estimated: false,
    });
    expect(bestOneRm([])).toBe(null);
  });
});

describe("constancia", () => {
  it("racha de semanas seguidas, contando la anterior si esta aún no tiene clase", () => {
    const dates = ["2026-10-05", "2026-10-13", "2026-10-21", "2026-10-22"];
    expect(weeklyStreaks(dates, "2026-10-26")).toEqual({ current: 3, best: 3 });
    expect(weeklyStreaks([...dates, "2026-10-26"], "2026-10-28")).toEqual({ current: 4, best: 4 });
    expect(weeklyStreaks(["2026-09-01", "2026-10-21"], "2026-10-26")).toEqual({
      current: 1,
      best: 1,
    });
    expect(weeklyStreaks([], "2026-10-26")).toEqual({ current: 0, best: 0 });
  });

  it("mayoría de edad para los mensajes", () => {
    expect(isAdultOn("2008-10-27", "2026-10-26")).toBe(false);
    expect(isAdultOn("2008-10-26", "2026-10-26")).toBe(true);
    expect(isAdultOn(null, "2026-10-26")).toBe(true);
  });
});

describe("catálogo de benchmarks", () => {
  it("cada workout tiene código único, familia conocida y texto en los tres idiomas", () => {
    const codes = BENCHMARKS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const b of BENCHMARKS) {
      expect(BENCHMARK_FAMILIES).toContain(b.family);
      expect(b.description.es && b.description.ca && b.description.en).toBeTruthy();
    }
    for (const family of BENCHMARK_FAMILIES) {
      expect(BENCHMARKS.some((b) => b.family === family)).toBe(true);
    }
  });

  it("un AMRAP trae sus minutos para llenar el bloque", () => {
    for (const b of BENCHMARKS.filter((x) => x.scoreType === "rounds_reps")) {
      expect(b.minutes, b.code).toBeGreaterThan(0);
    }
    expect(BENCHMARKS.find((b) => b.code === "cindy")?.minutes).toBe(20);
    expect(BENCHMARKS.find((b) => b.code === "fran")?.minutes).toBeUndefined();
  });
});
