import { describe, expect, it } from "vitest";
import {
  AI_WOD_JSON_SCHEMA,
  AI_WOD_MAX_BLOCKS,
  aiWodCatalogs,
  aiWodSystemPrompt,
  aiWodUserPrompt,
  resolveWodProposal,
  type AiWodContext,
  type AiWodOutput,
} from "./fitness-ai.ts";
import { WorkoutBlockInputSchema } from "./fitness.ts";

type RawBlock = AiWodOutput["blocks"][number];
const block = (over: Partial<RawBlock> = {}): RawBlock => ({
  kind: "wod",
  title: "Engine",
  description: "AMRAP 12'\n10 wall balls\n10 box jumps\n200 m run",
  scoreType: "rounds_reps",
  timeCapSeconds: null,
  movementCode: null,
  percent: null,
  rmReps: null,
  scaled: "Wall ball 6/4 kg",
  rx: "Wall ball 9/6 kg",
  rxPlus: null,
  ...over,
});
const output = (blocks: RawBlock[], over: Partial<AiWodOutput> = {}): AiWodOutput => ({
  title: "Martes de motor",
  notes: "Motor largo tras dos días de fuerza.",
  blocks,
  ...over,
});

const context = (over: Partial<AiWodContext> = {}): AiWodContext => ({
  locale: "ca",
  sport: "CrossFit",
  section: "CrossFit",
  classType: "WOD",
  date: "2026-10-27",
  weekday: "martes",
  minutes: 60,
  focus: "Motor llarg sense barra",
  recent: [
    {
      date: "2026-10-26",
      weekday: "lunes",
      title: "Back squat day",
      classType: null,
      blocks: [
        {
          kind: "strength",
          title: "Back squat 5x5",
          scoreType: "load",
          movement: "Back squat",
          timeCapSeconds: null,
        },
      ],
    },
  ],
  upcoming: [],
  equipment: [{ name: "Assault bike", quantity: 6 }],
  ...aiWodCatalogs("ca"),
  ...over,
});

describe("propuesta de WOD con IA", () => {
  it("el prompt habla el idioma del club y da lo programado, el material y el foco", () => {
    const system = aiWodSystemPrompt(context());
    expect(system).toContain("catalán");
    expect(system).toContain("box de CrossFit");
    const user = aiWodUserPrompt(context());
    expect(user).toContain("martes 2026-10-27");
    expect(user).toContain("Tipo de clase: WOD");
    expect(user).toContain("60 minutos");
    expect(user).toContain("Back squat 5x5");
    expect(user).toContain("Assault bike (6)");
    expect(user).toContain("Foco del día: Motor llarg sense barra");
    expect(user).toContain("back_squat: Back squat");
    expect(user).toContain("Fran (time)");
    // Sin foco ni material, el modelo lo sabe.
    const bare = aiWodUserPrompt(context({ focus: null, equipment: [], classType: null }));
    expect(bare).toContain("Sin foco concreto");
    expect(bare).toContain("Sin inventario");
    expect(bare).toContain("Para todas las clases de la disciplina");
    expect(bare).not.toContain("biblioteca del box");
    // Con biblioteca de ejercicios, el modelo usa sus nombres.
    const withLibrary = aiWodUserPrompt(context({ exercises: ["Sled push", "Wall ball"] }));
    expect(withLibrary).toContain("Ejercicios de la biblioteca del box");
    expect(withLibrary).toContain("- Sled push");
  });

  it("el esquema JSON pide todos los campos de cada bloque del editor", () => {
    const item = AI_WOD_JSON_SCHEMA.properties.blocks.items;
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
    expect(item.properties.movementCode.anyOf[0]).toMatchObject({ type: "string" });
  });

  it("una salida correcta pasa tal cual y vale para guardar el WOD", () => {
    const proposal = resolveWodProposal(
      output([
        block({
          kind: "warmup",
          title: "Calentamiento",
          scoreType: "none",
          scaled: null,
          rx: null,
        }),
        block({
          kind: "strength",
          title: "Back squat",
          scoreType: "load",
          movementCode: "back_squat",
          percent: 75,
          description: "5x5 al 75 %",
        }),
        block({ kind: "wod", title: "Fran", scoreType: "time", timeCapSeconds: 480 }),
      ]),
    );
    expect(proposal?.title).toBe("Martes de motor");
    expect(proposal?.blocks.map((b) => b.kind)).toEqual(["warmup", "strength", "wod"]);
    expect(proposal?.blocks[1]).toMatchObject({ movementCode: "back_squat", percent: 75 });
    expect(proposal?.blocks[2]).toMatchObject({ timeCapSeconds: 480 });
    for (const b of proposal!.blocks)
      expect(WorkoutBlockInputSchema.safeParse(b).success).toBe(true);
  });

  it("quita lo que no encaja en vez de romper la propuesta", () => {
    const proposal = resolveWodProposal(
      output([
        // Movimiento fuera del catálogo: sin código, y su porcentaje con él.
        block({ kind: "strength", scoreType: "load", movementCode: "zercher", percent: 70 }),
        // Una máxima que no se puntúa en kilos no entra en las marcas.
        block({ kind: "strength", scoreType: "reps", movementCode: "deadlift", rmReps: 1 }),
        // Una máxima de un número de repeticiones que no se guarda, tampoco.
        block({ kind: "strength", scoreType: "load", movementCode: "deadlift", rmReps: 4 }),
        // Time cap absurdo, porcentaje imposible y textos largos.
        block({
          scoreType: "time",
          timeCapSeconds: 5,
          title: "x".repeat(200),
          rx: "y".repeat(900),
        }),
        block({ kind: "strength", scoreType: "load", movementCode: "snatch", percent: 300 }),
        // Sin título no hay bloque.
        block({ title: "   " }),
      ]),
    );
    expect(proposal).not.toBeNull();
    const [unknown, notLoad, odd, long, heavy] = proposal!.blocks;
    expect(unknown).toMatchObject({ movementCode: null, percent: null });
    expect(notLoad).toMatchObject({ movementCode: "deadlift", rmReps: null });
    expect(odd).toMatchObject({ rmReps: null });
    expect(long?.timeCapSeconds).toBeNull();
    expect(long?.title).toHaveLength(80);
    expect(long?.rx).toHaveLength(400);
    expect(heavy).toMatchObject({ movementCode: "snatch", percent: null });
    expect(proposal!.blocks).toHaveLength(5);
  });

  it("como mucho seis bloques; sin bloques o con un tipo desconocido, no vale", () => {
    const many = resolveWodProposal(output(Array.from({ length: 9 }, () => block())));
    expect(many?.blocks).toHaveLength(AI_WOD_MAX_BLOCKS);
    expect(resolveWodProposal(output([]))).toBeNull();
    expect(resolveWodProposal(output([block({ title: "" })]))).toBeNull();
    expect(resolveWodProposal(output([block({ kind: "metcon" })]))).toBeNull();
    expect(resolveWodProposal(output([block({ scoreType: "points" })]))).toBeNull();
    expect(resolveWodProposal(output([block()], { title: " ", notes: null }))).toMatchObject({
      title: null,
      notes: null,
    });
  });
});
