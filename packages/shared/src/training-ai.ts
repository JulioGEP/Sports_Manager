import { z } from "zod";
import type { Locale, LocalizedText } from "./locales.ts";
import { addDays } from "./training-load.ts";
import type { InsightLevel, InsightRule } from "./training-insights.ts";
import {
  RESTRICTION_TAGS,
  SESSION_BLOCKS,
  type AvailabilityStatus,
  type RestrictionTag,
  type SessionBlock,
  type TrainingContentKind,
} from "./training.ts";

/**
 * Propuesta de sesión con IA (ADR 0044). Encima de las reglas explicables de la ADR 0039: las
 * reglas detectan, la IA redacta un borrador y el cuerpo técnico decide. Todo lo que es dato vive
 * aquí y es puro: los perfiles de coach por tipo de sección, el formato de la petición y de la
 * propuesta, el prompt y la validación de lo que devuelve el modelo. La API reúne el contexto,
 * llama al modelo y guarda; la web enseña el formulario y la propuesta.
 *
 * Privacidad: el modelo nunca ve nombres de jugadores, fechas de nacimiento ni diagnósticos. Los
 * jugadores van como J1, J2… con su puesto y su disponibilidad; la API traduce de vuelta.
 */

// --- Modelo, precios y cuota ---

/** Modelo por defecto. `AI_MODEL` en el entorno lo cambia (por ejemplo, para un A/B). */
export const AI_DEFAULT_MODEL = "claude-opus-5-5";

/** Precio por millón de tokens, en dólares. Sirve para registrar el coste de cada llamada. */
export const AI_MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number }> =
  {
    "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
    "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  };

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Coste de una llamada en millonésimas de dólar. Como el precio va por millón de tokens, cada
 * token cuesta exactamente su precio en millonésimas. Un modelo sin precio conocido cuenta como
 * el más caro de la tabla: mejor sobrestimar que no ver el gasto.
 */
export function aiCostMicros(model: string, usage: AiUsage): number {
  const price = AI_MODEL_PRICES[model] ?? AI_MODEL_PRICES[AI_DEFAULT_MODEL]!;
  return Math.round(
    usage.inputTokens * price.input +
      usage.cacheWriteTokens * price.input * 1.25 +
      usage.cacheReadTokens * price.cacheRead +
      usage.outputTokens * price.output,
  );
}

/** Llamadas por club y semana (de lunes a domingo, en la zona del club). Configurable por club. */
export const AI_DEFAULT_WEEKLY_QUOTA = 5;
export const AI_MAX_WEEKLY_QUOTA = 100;
export const AiWeeklyQuotaSchema = z.number().int().min(0).max(AI_MAX_WEEKLY_QUOTA);

/**
 * Estado de una propuesta: en cola, generándose, lista o fallida. Las tres primeras gastan cuota;
 * una fallida no (se reserva al pedirla y se devuelve si falla).
 */
export const AI_GENERATION_STATUSES = ["queued", "running", "ready", "failed"] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];
export const AI_QUOTA_STATUSES: readonly AiGenerationStatus[] = ["queued", "running", "ready"];

/** Por qué falló una propuesta. La web lo traduce. */
export const AI_FAILURES = [
  "not_configured",
  "model_error",
  "invalid_output",
  "refused",
  "timeout",
] as const;
export type AiFailure = (typeof AI_FAILURES)[number];

/** Una propuesta que lleva más de esto en cola o generándose se da por perdida. */
export const AI_STALE_MINUTES = 15;

/** Fin de la semana de cuota que empieza el lunes `weekStart`. */
export const aiQuotaResetsOn = (weekStart: string) => addDays(weekStart, 7);

// --- Perfiles de coach ---

/**
 * Cada tipo de sección piensa distinto: un box de CrossFit no planifica como un centro de yoga ni
 * como un equipo benjamín. El perfil es dato, no código: quién es el experto, sus principios, sus
 * líneas rojas, cómo llama a cada bloque de la sesión y qué ejes se pueden potenciar. El club pone
 * encima su metodología ("cómo entrenamos aquí"); el perfil no lo toca el club.
 */
export const AI_PROFILE_CODES = [
  "team_formative",
  "team_performance",
  "racket",
  "swimming",
  "crossfit",
  "yoga",
  "pilates",
  "fitness",
  "generic",
] as const;
export type AiProfileCode = (typeof AI_PROFILE_CODES)[number];

export interface AiEmphasisAxis {
  code: string;
  label: LocalizedText;
  /** Qué significa este eje para el modelo. */
  hint: string;
}

export interface AiBlockSpec {
  label: LocalizedText;
  /** Qué va en este bloque, para el modelo. */
  guidance: string;
}

export interface AiCoachProfile {
  code: AiProfileCode;
  /** Sube cuando cambia el texto del perfil: se guarda con cada propuesta para comparar versiones. */
  version: number;
  name: LocalizedText;
  /** Quién es el experto. `{sport}` se sustituye por el deporte de la sección. */
  persona: string;
  principles: readonly string[];
  redLines: readonly string[];
  /** Bloques que usa este tipo de sesión, con su nombre. Los que no aparecen no se usan. */
  blocks: Partial<Record<SessionBlock, AiBlockSpec>>;
  axes: readonly AiEmphasisAxis[];
  /** Reparto por defecto de los 100 puntos entre los ejes. */
  defaultEmphasis: Readonly<Record<string, number>>;
  /** Cómo se expresan volumen e intensidad en este tipo de sesión. */
  units: string;
}

const t = (es: string, ca: string, en: string): LocalizedText => ({ es, ca, en });

const axis = (code: string, label: LocalizedText, hint: string): AiEmphasisAxis => ({
  code,
  label,
  hint,
});

/** Ejes de los deportes de equipo: los tipos de contenido de la sección (ADR 0039). */
const TEAM_AXES = {
  technical: axis(
    "technical",
    t("Técnico", "Tècnic", "Technical"),
    "Gestos con balón: pase, control, conducción, finalización, 1x1.",
  ),
  tactical: axis(
    "tactical",
    t("Táctico", "Tàctic", "Tactical"),
    "Toma de decisiones y principios de juego en ataque, defensa y transiciones.",
  ),
  physical: axis(
    "physical",
    t("Físico", "Físic", "Physical"),
    "Condición física: resistencia intermitente, velocidad, fuerza y prevención, mejor integrada en tareas con balón.",
  ),
  set_piece: axis(
    "set_piece",
    t("Balón parado", "Pilota aturada", "Set pieces"),
    "Acciones a balón parado ofensivas y defensivas.",
  ),
  goalkeeper: axis(
    "goalkeeper",
    t("Portero", "Porter", "Goalkeeper"),
    "Trabajo específico del portero y su participación en el juego.",
  ),
  psychological: axis(
    "psychological",
    t("Psicológico", "Psicològic", "Psychological"),
    "Atención, comunicación, cohesión, gestión del error y valores.",
  ),
} as const;

const DEFAULT_BLOCKS = {
  warmup: t("Activación", "Activació", "Warm-up"),
  main: t("Parte principal", "Part principal", "Main part"),
  goalkeepers: t("Porteros", "Porters", "Goalkeepers"),
  rehab: t("Readaptación", "Readaptació", "Return to play"),
  cooldown: t("Vuelta a la calma", "Tornada a la calma", "Cool-down"),
} as const;

const ADAPTATIONS = t("Adaptaciones", "Adaptacions", "Adaptations");

const PROFILES: Record<AiProfileCode, AiCoachProfile> = {
  team_formative: {
    code: "team_formative",
    version: 1,
    name: t("Formación en deportes de equipo", "Formació en esports d'equip", "Youth team sports"),
    persona:
      "Eres entrenador o entrenadora de {sport} con muchos años en fútbol base y formación de jugadores. Piensas como un coordinador de cantera: lo que importa es que aprendan, disfruten y quieran volver, no ganar el fin de semana.",
    principles: [
      "Aprender jugando: casi todo con balón, en juegos reducidos y situaciones reales de juego.",
      "Mucho tiempo de compromiso motor y poco de espera o de explicación. Una o dos consignas por tarea.",
      "Progresión de lo simple a lo complejo dentro de la sesión; el último bloque, partido o juego condicionado.",
      "La condición física se trabaja jugando, no aislada.",
      "Todos juegan y participan lo mismo. Grupos equilibrados y cambiantes.",
      "Espacio, número de jugadores y reglas adaptados a la edad. Pregunta más de lo que ordena.",
    ],
    redLines: [
      "Nada de trabajo físico aislado: ni series de carrera, ni abdominales, ni fuerza con cargas.",
      "Nada de filas ni de tareas en las que la mayoría mira.",
      "Por debajo de 10 años, sin puestos fijos ni portero fijo: se rota.",
      "Nunca castigos físicos ni juegos que eliminen a quien falla.",
    ],
    blocks: {
      warmup: {
        label: t("Calentamiento jugado", "Escalfament jugat", "Game-based warm-up"),
        guidance: "Un juego de activación con balón, de 10 a 15 minutos.",
      },
      main: {
        label: DEFAULT_BLOCKS.main,
        guidance:
          "Dos o tres tareas en progresión: juego reducido, situación de juego y partido condicionado.",
      },
      rehab: {
        label: DEFAULT_BLOCKS.rehab,
        guidance: "Solo si hay jugadores en readaptación o limitados: trabajo adaptado aparte.",
      },
      cooldown: {
        label: DEFAULT_BLOCKS.cooldown,
        guidance: "Cinco minutos: movilidad suave y una charla final con una sola idea.",
      },
    },
    axes: [TEAM_AXES.technical, TEAM_AXES.tactical, TEAM_AXES.physical, TEAM_AXES.psychological],
    defaultEmphasis: { technical: 45, tactical: 30, physical: 10, psychological: 15 },
    units:
      "Minutos por tarea y RPE previsto de 0 a 10 (en formación, la intensidad la da el juego).",
  },
  team_performance: {
    code: "team_performance",
    version: 1,
    name: t(
      "Competición en deportes de equipo",
      "Competició en esports d'equip",
      "Competitive team sports",
    ),
    persona:
      "Eres entrenador o entrenadora de {sport} de competición, con experiencia en primeros equipos. Planificas la semana alrededor del partido (días respecto al partido, MD) y cuidas la carga de cada jugador.",
    principles: [
      "La sesión responde a su día respecto al partido: MD+1 recuperación para quien jugó mucho y compensatorio para el resto; MD-4 y MD-3, más volumen e intensidad; MD-2, velocidad y táctica de poca carga; MD-1, activación corta y balón parado.",
      "Manda lo táctico: tareas con el modelo de juego y con lo que piden los últimos partidos y el próximo rival.",
      "Cada tarea con objetivo, reglas, espacio, número de jugadores, tiempos de trabajo y descanso e intensidad prevista.",
      "Si las recomendaciones avisan de carga alta o bienestar bajo, baja el volumen.",
      "Jugadores limitados: variante sin el gesto restringido o trabajo aparte, sin pasar sus minutos máximos.",
    ],
    redLines: [
      "Nunca metas a un jugador con restricciones en una tarea que las incumple.",
      "Nada de alta intensidad ni de volumen alto el día antes del partido (MD-1).",
      "Nada de tareas sin relación con el objetivo de la sesión.",
    ],
    blocks: {
      warmup: {
        label: DEFAULT_BLOCKS.warmup,
        guidance: "Activación y prevención, de 12 a 20 minutos, con balón si se puede.",
      },
      main: {
        label: DEFAULT_BLOCKS.main,
        guidance: "Tareas tácticas y técnico-tácticas en progresión hacia el juego real.",
      },
      goalkeepers: {
        label: DEFAULT_BLOCKS.goalkeepers,
        guidance: "Trabajo específico de porteros en paralelo, si hay entrenador de porteros.",
      },
      rehab: {
        label: DEFAULT_BLOCKS.rehab,
        guidance: "Jugadores en readaptación: trabajo individual según su fase.",
      },
      cooldown: {
        label: DEFAULT_BLOCKS.cooldown,
        guidance: "Movilidad y recuperación, de 5 a 10 minutos.",
      },
    },
    axes: [
      TEAM_AXES.technical,
      TEAM_AXES.tactical,
      TEAM_AXES.physical,
      TEAM_AXES.set_piece,
      TEAM_AXES.goalkeeper,
      TEAM_AXES.psychological,
    ],
    defaultEmphasis: {
      technical: 20,
      tactical: 40,
      physical: 20,
      set_piece: 10,
      goalkeeper: 5,
      psychological: 5,
    },
    units: "Minutos por tarea, series, repeticiones, descanso y RPE previsto de 0 a 10.",
  },
  racket: {
    code: "racket",
    version: 1,
    name: t("Deportes de raqueta", "Esports de raqueta", "Racket sports"),
    persona:
      "Eres entrenador o entrenadora de {sport} con experiencia en escuela y competición. Trabajas en pista con grupos pequeños, mucha repetición de calidad y situaciones de juego real.",
    principles: [
      "Calentamiento con movilidad y peloteo progresivo.",
      "Técnica por golpes con progresión (cesta, peloteo dirigido, situación de juego) y táctica por situaciones (saque y resto, red, defensa).",
      "Rotaciones para que nadie espere: ratio realista de jugadores por pista.",
      "Cierre con juego a puntos con una condición del objetivo.",
    ],
    redLines: [
      "En niños, nada de volumen alto de golpes potentes ni de trabajo físico de adulto.",
      "Respeta las restricciones de cada jugador (por ejemplo, sin saltos o sin golpeo).",
    ],
    blocks: {
      warmup: {
        label: t("Calentamiento", "Escalfament", "Warm-up"),
        guidance: "Movilidad y peloteo.",
      },
      main: { label: DEFAULT_BLOCKS.main, guidance: "Técnica, táctica y juego a puntos." },
      rehab: { label: DEFAULT_BLOCKS.rehab, guidance: "Trabajo adaptado para limitados." },
      cooldown: { label: DEFAULT_BLOCKS.cooldown, guidance: "Estiramientos y cierre." },
    },
    axes: [
      axis("technique", t("Técnica", "Tècnica", "Technique"), "Golpes y desplazamientos."),
      axis("tactics", t("Táctica", "Tàctica", "Tactics"), "Situaciones y toma de decisiones."),
      axis("physical", t("Físico", "Físic", "Physical"), "Velocidad, agilidad y prevención."),
      axis(
        "match_play",
        t("Juego a puntos", "Joc a punts", "Match play"),
        "Puntos y partidos condicionados.",
      ),
      axis(
        "mental",
        t("Mental", "Mental", "Mental"),
        "Concentración, rutinas y gestión del error.",
      ),
    ],
    defaultEmphasis: { technique: 35, tactics: 25, physical: 15, match_play: 20, mental: 5 },
    units: "Minutos por tarea, repeticiones o bolas por jugador y RPE previsto de 0 a 10.",
  },
  swimming: {
    code: "swimming",
    version: 1,
    name: t("Natación", "Natació", "Swimming"),
    persona:
      "Eres entrenador o entrenadora de natación. Programas en metros, series y zonas de intensidad, y cuidas la técnica en todos los estilos.",
    principles: [
      "Estructura: calentamiento (soltar, técnica y progresivos), serie principal con un objetivo claro y soltar al final.",
      "Cada tarea en metros: en las notas, series × distancia, estilo, salida o descanso y zona de intensidad.",
      "Técnica con educativos específicos por estilo.",
      "Volumen total adaptado a la edad y al nivel del grupo.",
    ],
    redLines: [
      "Nada de volúmenes de adulto en edades de iniciación.",
      "Nada de apneas largas ni de trabajo hipóxico sin control.",
      "Respeta las restricciones (sin saltos: salidas desde dentro del agua).",
    ],
    blocks: {
      warmup: {
        label: t("Calentamiento", "Escalfament", "Warm-up"),
        guidance: "Soltar, técnica y progresivos.",
      },
      main: {
        label: t("Serie principal", "Sèrie principal", "Main set"),
        guidance: "Una o dos series con objetivo.",
      },
      rehab: { label: ADAPTATIONS, guidance: "Variantes para nadadores limitados." },
      cooldown: {
        label: t("Soltar", "Afluixar", "Swim down"),
        guidance: "Nado suave y estiramientos.",
      },
    },
    axes: [
      axis(
        "technique",
        t("Técnica", "Tècnica", "Technique"),
        "Educativos y eficiencia por estilo.",
      ),
      axis(
        "aerobic",
        t("Aeróbico", "Aeròbic", "Aerobic"),
        "Base aeróbica y volumen a ritmo cómodo.",
      ),
      axis("threshold", t("Umbral", "Llindar", "Threshold"), "Series a ritmo de umbral."),
      axis("speed", t("Velocidad", "Velocitat", "Speed"), "Sprints cortos, salidas y virajes."),
      axis(
        "dryland",
        t("Fuera del agua", "Fora de l'aigua", "Dryland"),
        "Movilidad, core y fuerza fuera del agua.",
      ),
    ],
    defaultEmphasis: { technique: 30, aerobic: 30, threshold: 15, speed: 15, dryland: 10 },
    units: "Metros, series, salida o descanso, zona de intensidad y RPE previsto de 0 a 10.",
  },
  crossfit: {
    code: "crossfit",
    version: 1,
    name: t("Box de CrossFit", "Box de CrossFit", "CrossFit box"),
    persona:
      "Eres head coach de un box de CrossFit con experiencia en grupos de nivel mixto. Programas clases de una hora con escalado para todos.",
    principles: [
      "Estructura de clase: calentamiento general y específico, bloque de fuerza o técnica (skill), WOD y movilidad final.",
      "Cada WOD con formato (AMRAP, EMOM, For Time o intervalos), time cap, movimientos, repeticiones y cargas orientativas.",
      "Escalado siempre: en las notas, versión RX, intermedia y de iniciación.",
      "Técnica antes que carga e intensidad.",
      "Equilibra los patrones (empuje, tracción, bisagra, sentadilla, monoestructural) y no repitas el patrón dominante de la sesión anterior.",
      "Usa solo el material disponible.",
    ],
    redLines: [
      "Nada de cargas máximas en levantamientos olímpicos sin la técnica trabajada.",
      "Con restricciones de saltos o impacto, sustituye box jumps, double unders y burpees.",
      "Nada de trabajo hasta el fallo en grupos de iniciación.",
    ],
    blocks: {
      warmup: {
        label: t("Calentamiento", "Escalfament", "Warm-up"),
        guidance: "General y específico de los movimientos del día, de 10 a 15 minutos.",
      },
      main: {
        label: t("Fuerza / técnica y WOD", "Força / tècnica i WOD", "Strength / skill and WOD"),
        guidance: "Primero el bloque de fuerza o técnica; después el WOD.",
      },
      rehab: { label: ADAPTATIONS, guidance: "Versión adaptada para quien tenga restricciones." },
      cooldown: {
        label: t(
          "Movilidad y vuelta a la calma",
          "Mobilitat i tornada a la calma",
          "Mobility and cool-down",
        ),
        guidance: "Movilidad dirigida de 5 a 10 minutos.",
      },
    },
    axes: [
      axis("strength", t("Fuerza", "Força", "Strength"), "Levantamientos y fuerza con carga."),
      axis(
        "gymnastics",
        t("Gimnásticos", "Gimnàstics", "Gymnastics"),
        "Peso corporal: dominadas, fondos, pino, toes to bar.",
      ),
      axis("metcon", t("Metcon", "Metcon", "Metcon"), "Acondicionamiento metabólico: el WOD."),
      axis("mobility", t("Movilidad", "Mobilitat", "Mobility"), "Rango articular y prevención."),
      axis("skill", t("Técnica", "Tècnica", "Skill"), "Aprender o pulir un movimiento complejo."),
    ],
    defaultEmphasis: { strength: 25, gymnastics: 20, metcon: 35, mobility: 10, skill: 10 },
    units:
      "Minutos, formato del WOD, repeticiones, cargas orientativas (kg o % de la máxima) y RPE previsto de 0 a 10.",
  },
  yoga: {
    code: "yoga",
    version: 1,
    name: t("Yoga", "Ioga", "Yoga"),
    persona:
      "Eres profesor o profesora de yoga con formación avanzada y experiencia con grupos heterogéneos. Diseñas secuencias seguras, con un hilo conductor y alternativas para cada cuerpo.",
    principles: [
      "Estructura: centrado y respiración, calentamiento articular, saludos o secuencia de pie, suelo, invertidas o equilibrios opcionales con alternativa y relajación final.",
      "Cada tarea es un tramo de la secuencia: posturas en orden, tiempo o respiraciones, transiciones y alternativas con material (bloques, cinturón, manta).",
      "De lo suave a lo intenso y vuelta a la calma; compensa flexiones con extensiones y torsiones.",
      "Un hilo conductor (intención) que da sentido a la clase.",
      "Indicaciones claras de respiración.",
    ],
    redLines: [
      "Siempre una alternativa para invertidas y para posturas que cargan muñecas o cuello.",
      "Nada de invertidas para quien tenga restricciones o esté limitado.",
      "Nada de forzar rangos ni de retenciones largas de respiración en grupos de iniciación.",
    ],
    blocks: {
      warmup: {
        label: t("Centrado y calentamiento", "Centrament i escalfament", "Centring and warm-up"),
        guidance: "Respiración, intención y movilidad articular.",
      },
      main: {
        label: t("Secuencia principal", "Seqüència principal", "Main sequence"),
        guidance:
          "Saludos, posturas de pie, suelo y, si encaja, invertidas o equilibrios con alternativa.",
      },
      rehab: { label: ADAPTATIONS, guidance: "Alternativas para quien tenga restricciones." },
      cooldown: {
        label: t("Relajación final", "Relaxació final", "Final relaxation"),
        guidance: "Posturas de cierre y savasana.",
      },
    },
    axes: [
      axis("strength", t("Fuerza", "Força", "Strength"), "Posturas de sostén y fuerza."),
      axis(
        "flexibility",
        t("Flexibilidad", "Flexibilitat", "Flexibility"),
        "Aperturas y estiramiento.",
      ),
      axis(
        "balance",
        t("Equilibrio", "Equilibri", "Balance"),
        "Equilibrios de pie y sobre brazos.",
      ),
      axis(
        "breathing",
        t("Respiración", "Respiració", "Breathing"),
        "Pranayama y conciencia del aliento.",
      ),
      axis(
        "relaxation",
        t("Relajación", "Relaxació", "Relaxation"),
        "Restaurativo, relajación y meditación.",
      ),
    ],
    defaultEmphasis: { strength: 20, flexibility: 30, balance: 15, breathing: 20, relaxation: 15 },
    units: "Minutos por tramo, respiraciones por postura y RPE previsto de 0 a 10.",
  },
  pilates: {
    code: "pilates",
    version: 1,
    name: t("Pilates", "Pilates", "Pilates"),
    persona:
      "Eres instructor o instructora de pilates de suelo y pequeños aparatos, con experiencia en grupos y en espalda sana.",
    principles: [
      "Estructura: respiración y activación del centro, movilidad, bloque principal por series y estiramientos.",
      "Cada ejercicio con repeticiones, nivel y una variante más fácil y otra más difícil.",
      "Control, precisión y respiración antes que número de repeticiones.",
      "Equilibra flexión, extensión, rotación y trabajo lateral.",
    ],
    redLines: [
      "Alternativa a las flexiones de columna repetidas si hay molestias de espalda.",
      "Nada de impacto ni de saltos.",
      "Respeta las restricciones de cada persona.",
    ],
    blocks: {
      warmup: {
        label: t("Respiración y activación", "Respiració i activació", "Breathing and activation"),
        guidance: "Respiración, centro y movilidad.",
      },
      main: {
        label: t("Bloque principal", "Bloc principal", "Main block"),
        guidance: "Series por objetivos.",
      },
      rehab: { label: ADAPTATIONS, guidance: "Alternativas para quien tenga restricciones." },
      cooldown: {
        label: t("Estiramientos y cierre", "Estiraments i tancament", "Stretching and close"),
        guidance: "Estiramientos y relajación.",
      },
    },
    axes: [
      axis("core", t("Centro", "Centre", "Core"), "Estabilidad y fuerza del centro."),
      axis("mobility", t("Movilidad", "Mobilitat", "Mobility"), "Movilidad de columna y caderas."),
      axis("strength", t("Fuerza", "Força", "Strength"), "Fuerza de cadena posterior y global."),
      axis("posture", t("Postura", "Postura", "Posture"), "Alineación y control postural."),
      axis(
        "breathing",
        t("Respiración", "Respiració", "Breathing"),
        "Respiración lateral y control.",
      ),
    ],
    defaultEmphasis: { core: 30, mobility: 20, strength: 20, posture: 20, breathing: 10 },
    units: "Minutos, repeticiones por ejercicio y RPE previsto de 0 a 10.",
  },
  fitness: {
    code: "fitness",
    version: 1,
    name: t(
      "Fitness y entrenamiento funcional",
      "Fitness i entrenament funcional",
      "Fitness and functional training",
    ),
    persona:
      "Eres entrenador o entrenadora de fitness y entrenamiento funcional para grupos. Diseñas clases dinámicas, seguras y escalables.",
    principles: [
      "Estructura: calentamiento, bloque principal por circuitos o intervalos y vuelta a la calma.",
      "Cada ejercicio con tiempo o repeticiones, descanso y opción de menor impacto.",
      "Equilibra tren superior, tren inferior y core; combina fuerza y cardio.",
      "Usa solo el material disponible.",
    ],
    redLines: [
      "Siempre una opción sin impacto.",
      "Nada de ejercicios de riesgo sin técnica previa.",
      "Respeta las restricciones de cada persona.",
    ],
    blocks: {
      warmup: {
        label: t("Calentamiento", "Escalfament", "Warm-up"),
        guidance: "Movilidad y activación.",
      },
      main: {
        label: t("Bloque principal", "Bloc principal", "Main block"),
        guidance: "Circuitos o intervalos.",
      },
      rehab: { label: ADAPTATIONS, guidance: "Alternativas para quien tenga restricciones." },
      cooldown: { label: DEFAULT_BLOCKS.cooldown, guidance: "Estiramientos y respiración." },
    },
    axes: [
      axis("strength", t("Fuerza", "Força", "Strength"), "Fuerza con peso corporal o material."),
      axis("cardio", t("Cardio", "Cardio", "Cardio"), "Intervalos y resistencia."),
      axis("mobility", t("Movilidad", "Mobilitat", "Mobility"), "Rango articular."),
      axis("core", t("Core", "Core", "Core"), "Estabilidad del tronco."),
      axis(
        "coordination",
        t("Coordinación", "Coordinació", "Coordination"),
        "Agilidad y coordinación.",
      ),
    ],
    defaultEmphasis: { strength: 30, cardio: 30, mobility: 15, core: 15, coordination: 10 },
    units: "Minutos, tiempo de trabajo y descanso o repeticiones y RPE previsto de 0 a 10.",
  },
  generic: {
    code: "generic",
    version: 1,
    name: t("Entrenamiento general", "Entrenament general", "General training"),
    persona:
      "Eres entrenador o entrenadora experto en {sport}, con experiencia en formación y en competición.",
    principles: [
      "Estructura: calentamiento, parte principal en progresión y vuelta a la calma.",
      "Cada tarea con objetivo, organización, tiempos e intensidad prevista.",
      "Adaptada a la edad y al nivel del grupo.",
    ],
    redLines: [
      "Respeta las restricciones de cada deportista.",
      "En menores, nada de cargas ni de volúmenes de adulto.",
    ],
    blocks: {
      warmup: {
        label: t("Calentamiento", "Escalfament", "Warm-up"),
        guidance: "Activación progresiva.",
      },
      main: { label: DEFAULT_BLOCKS.main, guidance: "Tareas en progresión hacia el objetivo." },
      rehab: { label: DEFAULT_BLOCKS.rehab, guidance: "Trabajo adaptado para limitados." },
      cooldown: { label: DEFAULT_BLOCKS.cooldown, guidance: "Recuperación y cierre." },
    },
    axes: [TEAM_AXES.technical, TEAM_AXES.tactical, TEAM_AXES.physical, TEAM_AXES.psychological],
    defaultEmphasis: { technical: 35, tactical: 25, physical: 30, psychological: 10 },
    units: "Minutos por tarea y RPE previsto de 0 a 10.",
  },
};

/** Deportes de equipo y, de ellos, los de portería (con bloque de porteros). */
const TEAM_SPORTS = ["futsal", "football", "handball", "basketball", "volleyball"];
const GOAL_SPORTS = ["futsal", "football", "handball"];
const FAMILY_BY_SPORT: Record<string, AiProfileCode> = {
  padel: "racket",
  tennis: "racket",
  swimming: "swimming",
  crossfit: "crossfit",
  yoga: "yoga",
  pilates: "pilates",
  fitness: "fitness",
};

/** Perfil base de un deporte: el de equipo depende de si el grupo está en formación. */
export function aiProfileCodeFor(sportCode: string, formative: boolean): AiProfileCode {
  if (TEAM_SPORTS.includes(sportCode)) return formative ? "team_formative" : "team_performance";
  return FAMILY_BY_SPORT[sportCode] ?? "generic";
}

/**
 * Perfil efectivo de una sección: el de su familia con lo que cambia el deporte. Sin portería,
 * no hay bloque de porteros ni eje de portero.
 */
export function aiProfileFor(sportCode: string, formative: boolean): AiCoachProfile {
  const base = PROFILES[aiProfileCodeFor(sportCode, formative)];
  if (GOAL_SPORTS.includes(sportCode) || !base.blocks.goalkeepers) return base;
  const { goalkeepers: _g, ...blocks } = base.blocks;
  const axes = base.axes.filter((a) => a.code !== "goalkeeper");
  const removed = base.defaultEmphasis.goalkeeper ?? 0;
  const defaultEmphasis = Object.fromEntries(
    axes.map((a) => [
      a.code,
      (base.defaultEmphasis[a.code] ?? 0) + (a.code === "tactical" ? removed : 0),
    ]),
  );
  return { ...base, blocks, axes, defaultEmphasis };
}

/** Todos los perfiles, para la documentación y los tests. */
export const AI_PROFILES: Readonly<Record<AiProfileCode, AiCoachProfile>> = PROFILES;

/** Bloques que usa el perfil, en el orden de la sesión. */
export const aiProfileBlocks = (profile: AiCoachProfile): SessionBlock[] =>
  SESSION_BLOCKS.filter((b) => profile.blocks[b] !== undefined);

/**
 * Nombre de los bloques de la sesión en una sección (ADR 0044): las de actividad y los deportes
 * individuales llaman a sus bloques a su manera ("Secuencia principal", "WOD"). Los deportes de
 * equipo usan los de siempre: devuelve vacío y la web pone sus textos.
 */
export function sessionBlockLabels(
  sportCode: string,
): Partial<Record<SessionBlock, LocalizedText>> {
  if (TEAM_SPORTS.includes(sportCode)) return {};
  const profile = aiProfileFor(sportCode, false);
  return Object.fromEntries(aiProfileBlocks(profile).map((b) => [b, profile.blocks[b]!.label]));
}

/** Bloques que la sección no usa: no se enseñan vacíos (por ejemplo, porteros en yoga). */
export function unusedSessionBlocks(sportCode: string): SessionBlock[] {
  const used = new Set(aiProfileBlocks(aiProfileFor(sportCode, false)));
  if (TEAM_SPORTS.includes(sportCode))
    for (const b of aiProfileBlocks(aiProfileFor(sportCode, true))) used.add(b);
  return SESSION_BLOCKS.filter((b) => !used.has(b));
}

/** Mediana de edad de un grupo; nula si no hay fechas. */
export function medianAge(ages: readonly (number | null)[]): number | null {
  const known = ages.filter((a): a is number => a !== null).sort((a, b) => a - b);
  return known.length === 0 ? null : known[Math.floor(known.length / 2)]!;
}

// --- Petición del entrenador ---

export const AI_INTENSITIES = ["low", "medium", "high"] as const;
export type AiIntensity = (typeof AI_INTENSITIES)[number];

export const AI_EMPHASIS_TOTAL = 100;
const AxisCode = z.string().regex(/^[a-z][a-z_]{1,29}$/);

export const AiEmphasisSchema = z
  .record(AxisCode, z.number().int().min(0).max(AI_EMPHASIS_TOTAL))
  .refine((e) => Object.values(e).reduce((a, n) => a + n, 0) === AI_EMPHASIS_TOTAL, {
    message: "El balance tiene que sumar 100 puntos.",
  });
export type AiEmphasis = z.infer<typeof AiEmphasisSchema>;

/**
 * Lo que pide el entrenador: qué entrenamientos (uno, o los de la semana), objetivo, cómo reparte
 * los 100 puntos de énfasis, la intensidad, el material de hoy y el contexto que no está en datos.
 */
export const AiDraftRequestSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(7),
  objective: z.string().trim().max(200).nullable().optional(),
  emphasis: AiEmphasisSchema,
  intensity: z.enum(AI_INTENSITIES),
  /** Material del inventario de la sección disponible hoy. Sin el campo: todo el inventario. */
  equipmentIds: z.array(z.string().uuid()).max(80).optional(),
  extraEquipment: z.string().trim().max(300).nullable().optional(),
  /** Lo que no está en los datos: "venimos de perder 5-1", "hay tres nuevos". Sin nombres. */
  context: z.string().trim().max(800).nullable().optional(),
  /** Solo tareas de la biblioteca (si no, puede proponer tareas nuevas, marcadas). */
  libraryOnly: z.boolean().optional(),
  /** Variantes para los jugadores con restricciones. */
  includeVariants: z.boolean().optional(),
});
export type AiDraftRequest = z.infer<typeof AiDraftRequestSchema>;

/**
 * Balance de partida del formulario: el reparto objetivo de la sección para la categoría (ADR
 * 0039) si encaja con los ejes del perfil, llevado a 100 puntos; si no, el del perfil.
 */
export function defaultEmphasisFor(
  profile: AiCoachProfile,
  target: Partial<Record<string, number>> | null | undefined,
): AiEmphasis {
  const codes = profile.axes.map((a) => a.code);
  const raw = codes.map((c) => Math.max(0, target?.[c] ?? 0));
  const total = raw.reduce((a, n) => a + n, 0);
  if (total === 0) return { ...profile.defaultEmphasis };
  // Reparto por restos mayores: los enteros suman exactamente 100.
  const exact = raw.map((n) => (n * AI_EMPHASIS_TOTAL) / total);
  const floor = exact.map(Math.floor);
  let left = AI_EMPHASIS_TOTAL - floor.reduce((a, n) => a + n, 0);
  const order = exact.map((n, i) => [n - floor[i]!, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left === 0) break;
    floor[i]! += 1;
    left -= 1;
  }
  return Object.fromEntries(codes.map((c, i) => [c, floor[i]!]));
}

/** Valida el balance contra los ejes del perfil: solo sus ejes, y faltar es cero. */
export function emphasisFor(profile: AiCoachProfile, emphasis: AiEmphasis): AiEmphasis | null {
  const codes = new Set(profile.axes.map((a) => a.code));
  if (Object.keys(emphasis).some((k) => !codes.has(k))) return null;
  return Object.fromEntries(profile.axes.map((a) => [a.code, emphasis[a.code] ?? 0]));
}

// --- Contexto que ve el modelo ---

/** Un entrenamiento a planificar, con su referencia (S1, S2…). */
export interface AiContextSession {
  ref: string;
  eventId: string;
  date: string;
  weekday: string;
  start: string;
  minutes: number;
  facility: { name: string; kind: string; description: string | null } | null;
  mdLabel: string | null;
  objective: string | null;
}

/** Un jugador sin datos personales: referencia, puesto y disponibilidad. */
export interface AiContextPlayer {
  ref: string;
  playerId: string;
  position: string | null;
  goalkeeper: boolean;
  status: AvailabilityStatus;
  restrictions: RestrictionTag[];
  maxMinutes: number | null;
}

export interface AiContextContent {
  ref: string;
  id: string;
  name: string;
  kind: TrainingContentKind;
}

export interface AiContextDrill {
  ref: string;
  id: string;
  name: string;
  description: string | null;
  contents: string[];
  format: string | null;
  space: string | null;
  playersMin: number | null;
  playersMax: number | null;
  durationMin: number | null;
  targetRpe: number | null;
  material: string | null;
  restrictionTags: RestrictionTag[];
  rating: number | null;
  uses: number;
}

export interface AiContextInsight {
  rule: InsightRule;
  level: InsightLevel;
  /** Referencia del jugador (J3), si va de uno. */
  player: string | null;
  values: Record<string, string | number>;
  contents: string[];
}

export interface AiContext {
  locale: Locale;
  profile: AiCoachProfile;
  sport: string;
  section: string;
  team: string;
  category: string | null;
  formative: boolean;
  ages: { median: number; min: number; max: number } | null;
  /** "Cómo entrenamos aquí": la metodología del club en sus palabras. */
  methodologyNotes: string | null;
  sessions: AiContextSession[];
  roster: AiContextPlayer[];
  cycle: { name: string; focus: string[]; targetWeeklyLoad: number | null } | null;
  previousMatch: { date: string; opponent: string | null; result: string | null } | null;
  nextMatch: { date: string; opponent: string | null } | null;
  recentSessions: { date: string; objective: string | null; items: string[] }[];
  insights: AiContextInsight[];
  contents: AiContextContent[];
  library: AiContextDrill[];
  equipment: { name: string; quantity: number | null }[];
  request: {
    objective: string | null;
    emphasis: AiEmphasis;
    intensity: AiIntensity;
    extraEquipment: string | null;
    context: string | null;
    libraryOnly: boolean;
    includeVariants: boolean;
  };
}

/** Máximo de tareas de la biblioteca que se mandan: las mejor valoradas y más usadas primero. */
export const AI_LIBRARY_LIMIT = 80;

/**
 * Cambia los nombres de la plantilla por su referencia en un texto libre del entrenador, para que
 * el modelo nunca reciba un nombre aunque alguien lo escriba. Ignora mayúsculas y acentos.
 */
export function redactNames(
  text: string,
  people: readonly { ref: string; names: readonly string[] }[],
): string {
  // En NFC cada letra acentuada es un carácter, así que el texto plegado mide lo mismo.
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text.normalize("NFC");
  const terms = people
    .flatMap((p) => p.names.filter((n) => n.trim().length >= 3).map((n) => ({ ref: p.ref, n })))
    .sort((a, b) => b.n.length - a.n.length);
  for (const { ref, n } of terms) {
    const folded = fold(out);
    const pattern = new RegExp(`(^|[^\\p{L}])(${escape(fold(n))})(?=$|[^\\p{L}])`, "giu");
    let result = "";
    let last = 0;
    for (const m of folded.matchAll(pattern)) {
      const start = m.index + m[1]!.length;
      result += out.slice(last, start) + ref;
      last = start + m[2]!.length;
    }
    out = result + out.slice(last);
  }
  return out;
}

// --- Prompt ---

const LANGUAGE: Record<Locale, string> = { es: "castellano", ca: "catalán", en: "inglés" };
const INTENSITY: Record<AiIntensity, string> = {
  low: "suave (RPE 3 a 4)",
  medium: "media (RPE 5 a 6)",
  high: "alta (RPE 7 a 8)",
};
const STATUS: Record<AvailabilityStatus, string> = {
  available: "disponible",
  limited: "limitado",
  rehab: "en readaptación",
  out: "de baja (no entrena)",
};

/** Qué detecta cada regla, para que el modelo entienda las cifras de "A tener en cuenta". */
export const AI_RULE_HINTS: Record<InsightRule, string> = {
  finishing_drop: "Cae el acierto en el tiro respecto a la media de la temporada.",
  turnovers_up: "Más pérdidas de balón por partido que la media.",
  early_fouls: "El equipo llega pronto al tope de faltas de una parte.",
  late_goals: "Muchos goles en contra en los últimos minutos de cada parte.",
  corners_no_goal: "Los saques de esquina a favor no acaban en gol.",
  known_opponent: "El próximo rival ya se jugó: resultado de aquel partido.",
  md_plus_one:
    "Día después del partido: grupos de recuperación y compensatorio por minutos jugados.",
  double_match_week: "Semana con dos partidos: menos volumen.",
  weekly_load: "Carga planificada de la semana muy por encima o por debajo de las anteriores.",
  content_gap: "Un contenido foco del ciclo lleva días sin trabajarse.",
  drill_low_rating: "Una tarea repetida está valorada como que no funciona.",
  restriction_conflict: "Un jugador limitado choca con una tarea planificada.",
  wellness_drop: "Bienestar bajo o dolor alto de un jugador.",
  acwr: "Relación de carga aguda:crónica de un jugador fuera del umbral (aviso, no predicción).",
  return_progression: "Jugador que vuelve de baja: progresión de carga.",
  rpe_above_target: "Un jugador siente las sesiones más duras de lo previsto.",
  focus_gap: "El objetivo individual de un jugador lleva poco trabajo.",
  strength: "Fortaleza de un jugador: puede ser referencia en una tarea.",
  low_attendance: "Asistencia baja de un jugador.",
  minutes_balance: "Formación: un jugador juega muchos menos minutos que la media.",
};

const lines = (items: readonly string[]) => items.map((i) => `- ${i}`).join("\n");
const json = (value: unknown) => JSON.stringify(value);

/** Instrucciones fijas del perfil: quién es, cómo trabaja y las reglas del formato. */
export function aiSystemPrompt(context: Pick<AiContext, "profile" | "sport" | "locale">): string {
  const { profile } = context;
  const blocks = aiProfileBlocks(profile)
    .map((b) => `- ${b} («${profile.blocks[b]!.label.es}»): ${profile.blocks[b]!.guidance}`)
    .join("\n");
  return [
    profile.persona.replaceAll("{sport}", context.sport),
    "Tu trabajo es proponer el borrador de una o varias sesiones de entrenamiento a partir de lo que sabe el club: el grupo, su disponibilidad, lo que dicen los partidos y la carga, la biblioteca de tareas, el material y lo que pide quien entrena. Es un borrador: quien entrena lo revisa y decide.",
    `## Cómo trabajas\n${lines(profile.principles)}`,
    `## Lo que nunca haces\n${lines(profile.redLines)}`,
    `## Bloques de la sesión (usa solo estos)\n${blocks}`,
    `## Unidades\n${profile.units}`,
    `## Reglas del borrador
- Escribe todos los textos en ${LANGUAGE[context.locale]}.
- Usa las referencias tal cual vienen (S1, J1, T1, C1). No inventes referencias.
- Los jugadores son J1, J2…: no tienes ni necesitas sus nombres. "players" vacío o nulo significa todo el grupo disponible.
- Quien está de baja no entrena. Quien está en readaptación va al bloque de readaptación o de adaptaciones. Un limitado no puede estar en una tarea cuyas etiquetas choquen con sus restricciones ni pasar sus minutos máximos: dale una variante en las notas o una tarea aparte con "players".
- Prefiere tareas de la biblioteca ("drill" con su referencia T#). Una tarea nueva va con "drill": null y "newDrill" relleno con lo necesario para hacerla.
- Los minutos de las tareas de una sesión suman, como mucho, la duración de la sesión.
- El balance de énfasis es el reparto aproximado de minutos de la parte principal entre los ejes.
- Las notas de cada tarea dicen cómo se hace: organización, reglas, consignas clave y variantes. Breves (menos de 400 caracteres).
- "rationale" explica por qué la sesión es así: conecta con lo que pide quien entrena, las recomendaciones y el momento de la semana.
- "warnings" avisa de lo que quien entrena tiene que revisar (por ejemplo, poco material para el grupo).`,
  ].join("\n\n");
}

/** Lo que cambia en cada petición: el grupo, la semana, la biblioteca y lo que se pide. */
export function aiUserPrompt(context: AiContext): string {
  const { profile, request } = context;
  const parts: string[] = [];
  parts.push(
    `## Grupo\n${lines(
      [
        `Sección: ${context.section} (${context.sport}). Grupo: ${context.team}${context.category ? `, categoría ${context.category}` : ""}.`,
        context.ages
          ? `Edad: mediana de ${context.ages.median} años (de ${context.ages.min} a ${context.ages.max}).`
          : "Edad: sin datos.",
        context.formative ? "Grupo en formación." : "Grupo de competición o de adultos.",
        `${context.roster.length} deportistas en la plantilla.`,
      ].filter(Boolean),
    )}`,
  );
  if (context.methodologyNotes)
    parts.push(`## Cómo entrenamos aquí (metodología del club)\n${context.methodologyNotes}`);
  parts.push(
    `## Sesiones a planificar\n${context.sessions
      .map((s) =>
        json({
          ref: s.ref,
          fecha: `${s.weekday} ${s.date}`,
          hora: s.start,
          minutos: s.minutes,
          instalacion: s.facility
            ? `${s.facility.name} (${s.facility.kind})${s.facility.description ? `: ${s.facility.description}` : ""}`
            : null,
          diaRespectoAlPartido: s.mdLabel,
          objetivoYaPuesto: s.objective,
        }),
      )
      .join("\n")}`,
  );
  parts.push(
    `## Plantilla y disponibilidad\n${context.roster
      .map((p) =>
        json({
          ref: p.ref,
          puesto: p.position,
          portero: p.goalkeeper || undefined,
          estado: STATUS[p.status],
          restricciones: p.restrictions.length > 0 ? p.restrictions : undefined,
          minutosMaximos: p.maxMinutes ?? undefined,
        }),
      )
      .join("\n")}`,
  );
  const calendar: string[] = [];
  if (context.previousMatch)
    calendar.push(
      `Último partido: ${context.previousMatch.date}${context.previousMatch.opponent ? ` contra ${context.previousMatch.opponent}` : ""}${context.previousMatch.result ? ` (${context.previousMatch.result})` : ""}.`,
    );
  if (context.nextMatch)
    calendar.push(
      `Próximo partido: ${context.nextMatch.date}${context.nextMatch.opponent ? ` contra ${context.nextMatch.opponent}` : ""}.`,
    );
  if (context.cycle)
    calendar.push(
      `Ciclo actual: ${context.cycle.name}${context.cycle.focus.length > 0 ? `; foco en ${context.cycle.focus.join(", ")}` : ""}${context.cycle.targetWeeklyLoad ? `; carga semanal objetivo ${context.cycle.targetWeeklyLoad} UA` : ""}.`,
    );
  if (calendar.length > 0) parts.push(`## Calendario\n${lines(calendar)}`);
  if (context.recentSessions.length > 0)
    parts.push(
      `## Sesiones de los últimos días (para no repetir)\n${context.recentSessions
        .map(
          (s) =>
            `- ${s.date}${s.objective ? ` · ${s.objective}` : ""}: ${s.items.join("; ") || "sin tareas"}`,
        )
        .join("\n")}`,
    );
  if (context.insights.length > 0)
    parts.push(
      `## A tener en cuenta (recomendaciones del club, de la más urgente a la menos)\n${context.insights
        .map((i) =>
          json({
            regla: i.rule,
            significa: AI_RULE_HINTS[i.rule],
            nivel: i.level,
            jugador: i.player ?? undefined,
            cifras: i.values,
            contenidos: i.contents.length > 0 ? i.contents : undefined,
          }),
        )
        .join("\n")}`,
    );
  parts.push(
    `## Contenidos de la sección\n${context.contents
      .map((c) => `- ${c.ref}: ${c.name} (${c.kind})`)
      .join("\n")}`,
  );
  parts.push(
    context.library.length > 0
      ? `## Biblioteca de tareas\n${context.library
          .map((d) =>
            json({
              ref: d.ref,
              nombre: d.name,
              descripcion: d.description ?? undefined,
              contenidos: d.contents,
              formato: d.format ?? undefined,
              espacio: d.space ?? undefined,
              jugadores:
                d.playersMin || d.playersMax
                  ? `${d.playersMin ?? "?"}-${d.playersMax ?? "?"}`
                  : undefined,
              minutos: d.durationMin ?? undefined,
              rpe: d.targetRpe ?? undefined,
              material: d.material ?? undefined,
              etiquetas: d.restrictionTags.length > 0 ? d.restrictionTags : undefined,
              valoracion: d.rating ?? undefined,
              usos: d.uses || undefined,
            }),
          )
          .join("\n")}`
      : "## Biblioteca de tareas\nVacía: propón tareas nuevas.",
  );
  const equipment = context.equipment.map((e) =>
    e.quantity ? `${e.name} (${e.quantity})` : e.name,
  );
  if (request.extraEquipment) equipment.push(request.extraEquipment);
  parts.push(
    `## Material disponible\n${equipment.length > 0 ? lines(equipment) : "Sin inventario: usa material básico y avisa en warnings de lo que haga falta."}`,
  );
  const balance = profile.axes
    .filter((a) => (request.emphasis[a.code] ?? 0) > 0)
    .map((a) => `${a.label.es} ${request.emphasis[a.code]} % (${a.hint})`);
  parts.push(
    `## Lo que pide quien entrena\n${lines(
      [
        request.objective
          ? `Objetivo: ${request.objective}`
          : "Objetivo: propón tú el más adecuado.",
        `Balance de énfasis: ${balance.join("; ")}.`,
        `Intensidad: ${INTENSITY[request.intensity]}.`,
        request.libraryOnly
          ? "Usa solo tareas de la biblioteca. Si no hay ninguna adecuada para algo, pon una tarea libre breve sin newDrill."
          : "Puedes proponer tareas nuevas si la biblioteca no cubre algo.",
        request.includeVariants
          ? "Incluye variantes para los jugadores con restricciones."
          : "No hace falta detallar variantes para limitados.",
        request.context ? `Contexto: ${request.context}` : "",
      ].filter(Boolean),
    )}`,
  );
  return parts.join("\n\n");
}

// --- Propuesta: lo que devuelve el modelo ---

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const STRING = { type: "string" };
const INTEGER = { type: "integer" };
const REFS = { type: "array", items: STRING };

/**
 * Esquema JSON de la salida estructurada. Solo lo que la API admite (sin mínimos ni máximos): los
 * límites los pone `AiProposalSchema` al leerla.
 */
export const AI_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sessions"],
  properties: {
    summary: STRING,
    sessions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "session",
          "objective",
          "targetRpe",
          "contents",
          "rationale",
          "blocks",
          "equipment",
          "warnings",
        ],
        properties: {
          session: STRING,
          objective: STRING,
          targetRpe: INTEGER,
          contents: REFS,
          rationale: STRING,
          equipment: { type: "array", items: STRING },
          warnings: { type: "array", items: STRING },
          blocks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["block", "items"],
              properties: {
                block: { type: "string", enum: [...SESSION_BLOCKS] },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "drill",
                      "title",
                      "minutes",
                      "sets",
                      "reps",
                      "restSec",
                      "targetRpe",
                      "group",
                      "players",
                      "contents",
                      "notes",
                      "newDrill",
                    ],
                    properties: {
                      drill: nullable(STRING),
                      title: STRING,
                      minutes: INTEGER,
                      sets: nullable(INTEGER),
                      reps: nullable(INTEGER),
                      restSec: nullable(INTEGER),
                      targetRpe: nullable(INTEGER),
                      group: nullable(STRING),
                      players: nullable(REFS),
                      contents: REFS,
                      notes: STRING,
                      newDrill: nullable({
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "description",
                          "rules",
                          "coachingPoints",
                          "variants",
                          "format",
                          "space",
                          "playersMin",
                          "playersMax",
                          "material",
                          "restrictionTags",
                        ],
                        properties: {
                          description: STRING,
                          rules: nullable(STRING),
                          coachingPoints: nullable(STRING),
                          variants: nullable(STRING),
                          format: nullable(STRING),
                          space: nullable(STRING),
                          playersMin: nullable(INTEGER),
                          playersMax: nullable(INTEGER),
                          material: nullable(STRING),
                          restrictionTags: {
                            type: "array",
                            items: { type: "string", enum: [...RESTRICTION_TAGS] },
                          },
                        },
                      }),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Texto recortado: lo que pase del máximo se corta en vez de rechazar la propuesta entera. */
const text = (max: number) => z.string().transform((s) => s.trim().slice(0, max));
const optText = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((s) => (s?.trim() ? s.trim().slice(0, max) : null));
const int = (min: number, max: number) =>
  z.number().transform((n) => Math.min(max, Math.max(min, Math.round(n))));
const optInt = (min: number, max: number) =>
  z
    .number()
    .nullable()
    .optional()
    .transform((n) =>
      n === null || n === undefined ? null : Math.min(max, Math.max(min, Math.round(n))),
    );
/** Lista recortada: lo que sobra se descarta en vez de rechazar la propuesta. */
const list = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(item)
    .nullable()
    .optional()
    .transform((a): z.output<T>[] => (a ?? []).slice(0, max));
const refs = list(z.string(), 40);

const NewDrillSchema = z.object({
  description: text(2000),
  rules: optText(2000),
  coachingPoints: optText(2000),
  variants: optText(2000),
  format: optText(30),
  space: optText(60),
  playersMin: optInt(1, 60),
  playersMax: optInt(1, 60),
  material: optText(400),
  restrictionTags: list(z.string(), 10).transform((tags) =>
    tags.filter((tag): tag is RestrictionTag =>
      (RESTRICTION_TAGS as readonly string[]).includes(tag),
    ),
  ),
});
export type AiNewDrill = z.infer<typeof NewDrillSchema>;

/** Lectura tolerante de la salida del modelo: corta textos y encaja números en su rango. */
export const AiProposalSchema = z.object({
  summary: text(1200),
  sessions: list(
    z.object({
      session: z.string(),
      objective: text(160),
      targetRpe: int(0, 10),
      contents: refs,
      rationale: text(1200),
      equipment: list(text(120), 30),
      warnings: list(text(300), 10),
      blocks: list(
        z.object({
          block: z.string(),
          items: list(
            z.object({
              drill: z.string().nullable().optional(),
              title: text(80),
              minutes: int(1, 240),
              sets: optInt(1, 50),
              reps: optInt(1, 200),
              restSec: optInt(0, 1800),
              targetRpe: optInt(0, 10),
              group: optText(40),
              players: z.array(z.string()).nullable().optional(),
              contents: refs,
              notes: text(400),
              newDrill: NewDrillSchema.nullable().optional(),
            }),
            40,
          ),
        }),
        10,
      ),
    }),
    7,
  ),
});
export type AiProposalOutput = z.infer<typeof AiProposalSchema>;

// --- Propuesta validada: con ids del club, lista para enseñar y aplicar ---

export const AI_CHECKS = [
  "unknown_session",
  "unknown_drill",
  "block_moved",
  "player_out",
  "restriction",
  "max_minutes",
  "over_time",
  "trimmed",
] as const;
export type AiCheckCode = (typeof AI_CHECKS)[number];

const IdList = z.array(z.string().uuid());

export const AiProposalItemSchema = z.object({
  drillId: z.string().uuid().nullable(),
  title: z.string(),
  minutes: z.number().int(),
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  restSec: z.number().int().nullable(),
  targetRpe: z.number().int().nullable(),
  groupLabel: z.string().nullable(),
  playerIds: IdList.nullable(),
  contentIds: IdList,
  notes: z.string().nullable(),
  restrictionTags: z.array(z.enum(RESTRICTION_TAGS)),
  newDrill: z
    .object({
      description: z.string(),
      rules: z.string().nullable(),
      coachingPoints: z.string().nullable(),
      variants: z.string().nullable(),
      format: z.string().nullable(),
      space: z.string().nullable(),
      playersMin: z.number().int().nullable(),
      playersMax: z.number().int().nullable(),
      material: z.string().nullable(),
      restrictionTags: z.array(z.enum(RESTRICTION_TAGS)),
    })
    .nullable(),
});
export type AiProposalItem = z.infer<typeof AiProposalItemSchema>;

export const AiCheckSchema = z.object({
  code: z.enum(AI_CHECKS),
  playerId: z.string().uuid().nullable(),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type AiCheck = z.infer<typeof AiCheckSchema>;

export const AiProposalSessionSchema = z.object({
  eventId: z.string().uuid(),
  date: z.string(),
  minutes: z.number().int(),
  objective: z.string(),
  targetRpe: z.number().int(),
  contentIds: IdList,
  rationale: z.string(),
  blocks: z.array(
    z.object({
      block: z.enum(SESSION_BLOCKS),
      items: z.array(AiProposalItemSchema),
    }),
  ),
  plannedMinutes: z.number().int(),
  equipment: z.array(z.string()),
  warnings: z.array(z.string()),
  checks: z.array(AiCheckSchema),
});
export type AiProposalSession = z.infer<typeof AiProposalSessionSchema>;

export const AiProposalResolvedSchema = z.object({
  summary: z.string(),
  sessions: z.array(AiProposalSessionSchema),
  checks: z.array(AiCheckSchema),
});
export type AiProposalResolved = z.infer<typeof AiProposalResolvedSchema>;

/** Tope de tareas por bloque que admite el editor de la sesión. */
const BLOCK_ITEMS_MAX = 20;

/**
 * Traduce la salida del modelo a ids del club y la revisa con las mismas reglas que el editor:
 * referencias que existen, bloques del perfil, jugadores de baja fuera, restricciones y minutos.
 * Lo que no encaja no tumba la propuesta: se corrige o se avisa, y quien entrena decide.
 */
export function resolveProposal(output: AiProposalOutput, context: AiContext): AiProposalResolved {
  const sessions = new Map(context.sessions.map((s) => [s.ref, s]));
  const players = new Map(context.roster.map((p) => [p.ref, p]));
  const contents = new Map(context.contents.map((c) => [c.ref, c.id]));
  const drills = new Map(context.library.map((d) => [d.ref, d]));
  const allowed = new Set(aiProfileBlocks(context.profile));
  const fallbackBlock: SessionBlock = allowed.has("main")
    ? "main"
    : aiProfileBlocks(context.profile)[0]!;
  const globalChecks: AiCheck[] = [];
  const contentIdsOf = (list: readonly string[]) =>
    [...new Set(list.map((r) => contents.get(r)).filter((id): id is string => !!id))].slice(0, 8);
  const seen = new Set<string>();
  const resolved: AiProposalSession[] = [];

  for (const raw of output.sessions) {
    const session = sessions.get(raw.session);
    if (!session || seen.has(session.ref)) {
      globalChecks.push({ code: "unknown_session", playerId: null, values: { ref: raw.session } });
      continue;
    }
    seen.add(session.ref);
    const checks: AiCheck[] = [];
    const byBlock = new Map<SessionBlock, AiProposalItem[]>();
    const minutesOf = new Map<string, number>();

    for (const rawBlock of raw.blocks) {
      let block = rawBlock.block as SessionBlock;
      if (!allowed.has(block)) {
        checks.push({
          code: "block_moved",
          playerId: null,
          values: { from: rawBlock.block, to: fallbackBlock },
        });
        block = fallbackBlock;
      }
      for (const item of rawBlock.items) {
        const drill = item.drill ? drills.get(item.drill) : undefined;
        if (item.drill && !drill)
          checks.push({
            code: "unknown_drill",
            playerId: null,
            values: { ref: item.drill, title: item.title },
          });
        const explicit = item.players && item.players.length > 0;
        const named = explicit
          ? [
              ...new Set(
                item.players!.map((r) => players.get(r)).filter((p): p is AiContextPlayer => !!p),
              ),
            ]
          : [];
        for (const p of named.filter((p) => p.status === "out"))
          checks.push({ code: "player_out", playerId: p.playerId, values: { title: item.title } });
        const kept = named.filter((p) => p.status !== "out");
        // Una tarea solo para jugadores de baja (o desconocidos) no tiene a nadie: fuera.
        if (explicit && kept.length === 0) continue;
        const newDrill = drill ? null : (item.newDrill ?? null);
        const tags = drill ? drill.restrictionTags : (newDrill?.restrictionTags ?? []);
        // Sin jugadores explícitos, la tarea es de su grupo: la readaptación es de quien está en
        // ella, los porteros de los porteros y el resto de los disponibles y limitados.
        const fit = (p: AiContextPlayer) => p.status === "available" || p.status === "limited";
        const participants = explicit
          ? kept
          : block === "rehab"
            ? []
            : block === "goalkeepers"
              ? context.roster.filter((p) => p.goalkeeper && fit(p))
              : context.roster.filter(fit);
        for (const p of participants) {
          const clash = p.restrictions.filter((r) => tags.includes(r));
          if (clash.length > 0)
            checks.push({
              code: "restriction",
              playerId: p.playerId,
              values: { title: item.title, tags: clash.join(", ") },
            });
          minutesOf.set(p.playerId, (minutesOf.get(p.playerId) ?? 0) + item.minutes);
        }
        const list = byBlock.get(block) ?? [];
        if (list.length >= BLOCK_ITEMS_MAX) {
          checks.push({ code: "trimmed", playerId: null, values: { title: item.title } });
          continue;
        }
        list.push({
          drillId: drill?.id ?? null,
          title: item.title || drill?.name || "—",
          minutes: item.minutes,
          sets: item.sets,
          reps: item.reps,
          restSec: item.restSec,
          targetRpe: item.targetRpe,
          groupLabel: item.group,
          playerIds: explicit ? kept.map((p) => p.playerId) : null,
          contentIds: contentIdsOf(item.contents),
          notes: item.notes || null,
          restrictionTags: [...tags],
          newDrill: newDrill
            ? {
                description: newDrill.description,
                rules: newDrill.rules,
                coachingPoints: newDrill.coachingPoints,
                variants: newDrill.variants,
                format: newDrill.format,
                space: newDrill.space,
                playersMin: newDrill.playersMin,
                playersMax: newDrill.playersMax,
                material: newDrill.material,
                restrictionTags: newDrill.restrictionTags,
              }
            : null,
        });
        byBlock.set(block, list);
      }
    }

    for (const p of context.roster)
      if (p.maxMinutes !== null && (minutesOf.get(p.playerId) ?? 0) > p.maxMinutes)
        checks.push({
          code: "max_minutes",
          playerId: p.playerId,
          values: { minutes: minutesOf.get(p.playerId)!, max: p.maxMinutes },
        });
    const blocks = SESSION_BLOCKS.filter((b) => byBlock.has(b)).map((b) => ({
      block: b,
      items: byBlock.get(b)!,
    }));
    // Los bloques paralelos (porteros, readaptación) no suman al tiempo de la sesión.
    const plannedMinutes = blocks
      .filter((b) => b.block !== "goalkeepers" && b.block !== "rehab")
      .flatMap((b) => b.items)
      .reduce((a, i) => a + i.minutes, 0);
    if (plannedMinutes > session.minutes + 5)
      checks.push({
        code: "over_time",
        playerId: null,
        values: { planned: plannedMinutes, available: session.minutes },
      });
    resolved.push({
      eventId: session.eventId,
      date: session.date,
      minutes: session.minutes,
      objective: raw.objective,
      targetRpe: raw.targetRpe,
      contentIds: contentIdsOf(raw.contents),
      rationale: raw.rationale,
      blocks,
      plannedMinutes,
      equipment: raw.equipment,
      warnings: raw.warnings,
      checks: dedupeChecks(checks),
    });
  }
  const order = new Map(context.sessions.map((s, i) => [s.eventId, i]));
  resolved.sort((a, b) => order.get(a.eventId)! - order.get(b.eventId)!);
  return { summary: output.summary, sessions: resolved, checks: dedupeChecks(globalChecks) };
}

function dedupeChecks(checks: AiCheck[]): AiCheck[] {
  const seen = new Set<string>();
  return checks.filter((c) => {
    const key = `${c.code}|${c.playerId ?? ""}|${JSON.stringify(c.values)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
