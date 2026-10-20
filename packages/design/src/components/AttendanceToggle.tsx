/**
 * Control de asistencia con dos botones: Presente / Falta. Ver DESIGN.md, sección 9.3.
 * - Marcar asistencia NO pide confirmación: no es una acción delicada.
 * - La falta se distingue por posición, texto y color, nunca solo por color.
 * - Cada botón mide 44 px de alto; el grupo, 48 px.
 */

export type Attendance = "present" | "absent" | null;

export interface AttendanceLabels {
  present: string;
  absent: string;
  /** Etiqueta accesible del grupo. Recibe el nombre del jugador. */
  group: (playerName: string) => string;
}

const defaultLabels: AttendanceLabels = {
  present: "Presente",
  absent: "Falta",
  group: (name) => `Asistencia de ${name}`,
};

export interface AttendanceToggleProps {
  playerName: string;
  value: Attendance;
  onChange: (value: Exclude<Attendance, null>) => void;
  labels?: AttendanceLabels;
}

export function AttendanceToggle({
  playerName,
  value,
  onChange,
  labels = defaultLabels,
}: AttendanceToggleProps) {
  const item =
    "h-11 rounded-control px-3 text-secondary font-semibold transition-colors duration-150";
  return (
    <div
      role="group"
      aria-label={labels.group(playerName)}
      className="inline-flex shrink-0 gap-0.5 rounded-control bg-raised p-0.5"
    >
      <button
        type="button"
        aria-pressed={value === "present"}
        onClick={() => onChange("present")}
        className={`${item} ${value === "present" ? "bg-club text-on-club" : "text-muted"}`}
      >
        {labels.present}
      </button>
      <button
        type="button"
        aria-pressed={value === "absent"}
        onClick={() => onChange("absent")}
        className={`${item} ${value === "absent" ? "bg-surface text-danger shadow-row" : "text-muted"}`}
      >
        {labels.absent}
      </button>
    </div>
  );
}
