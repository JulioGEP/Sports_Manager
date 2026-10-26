import {
  BENCHMARK_FAMILIES,
  BENCHMARKS,
  REP_MAXES,
  WORKOUT_BLOCK_KINDS,
  type BenchmarkEntry,
  type WorkoutBlockKind,
} from "@sportsmanager/shared";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  FORMATS_BY_KIND,
  letterOf,
  MINUTES_OPTIONAL,
  MINUTES_REQUIRED,
  QUIET_KINDS,
  type BlockDraft,
  type Format,
} from "@/components/fitness/programming-model";
import { useLocale, useT } from "@/lib/intl";
import { Button, Field, Icon, Input, Menu, MenuDivider, MenuItem, Select, Sheet } from "@/ui";

/** Errores de un bloque, por campo del editor. */
export type BlockErrors = Partial<
  Record<"title" | "description" | "minutes" | "movement" | "percent" | "levels", string>
>;

/** La pizarra crece con lo que se escribe: se lee entera, sin barras de desplazamiento. */
export function AutoTextarea({
  className = "",
  value,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      className={`w-full resize-none overflow-hidden rounded-field border border-control bg-surface px-4 py-3 text-body text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-2 focus:border-club focus:shadow-[0_0_0_4px_var(--club-soft)] aria-invalid:border-2 aria-invalid:border-danger ${className}`}
      {...rest}
    />
  );
}

/** Botones de elección (DESIGN.md 9.6): 44 px, seleccionado en tinta. */
function Choice({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-control px-3.5 text-secondary font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "bg-ink text-white" : "border border-control bg-surface text-ink hover:bg-raised"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Un bloque del WOD (ADR 0050): se elige el tipo, se escribe la pizarra y se dice el formato; el
 * resto sale del formato. Un calentamiento no pide marcador; una fuerza pide el movimiento y el
 * porcentaje (la app calcula los kilos de cada atleta); un WOD, si va por tiempo, AMRAP o EMOM.
 */
export function BlockEditor({
  block,
  index,
  count,
  errors,
  readOnly,
  movements,
  onChange,
  onKind,
  onMove,
  onDuplicate,
  onRemove,
  onBenchmark,
}: {
  block: BlockDraft;
  index: number;
  count: number;
  errors: BlockErrors;
  readOnly: boolean;
  movements: { code: string; name: string }[];
  onChange: (patch: Partial<BlockDraft>) => void;
  onKind: (kind: WorkoutBlockKind) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onBenchmark: () => void;
}) {
  const t = useT("fitness.staff.editor.block");
  const kinds = useT("fitness.common.blockKinds");
  const formats = useT("fitness.staff.editor.formats");
  const label = letterOf(index);
  const quiet = QUIET_KINDS.includes(block.kind);
  const [scoring, setScoring] = useState(!quiet || block.format !== "none");
  const [levels, setLevels] = useState(Boolean(block.scaled || block.rx || block.rxPlus));
  const showFormats = !quiet || scoring || block.format !== "none";
  const needsMinutes = MINUTES_REQUIRED.includes(block.format);
  const optionalMinutes = MINUTES_OPTIONAL.includes(block.format);
  const strength = block.format === "percent" || block.format === "max";

  return (
    <article
      className="flex flex-col gap-4 rounded-card bg-surface p-4 shadow-card sm:p-5 precisa:border precisa:border-border"
      aria-label={t("aria", { label, kind: kinds(block.kind) })}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1.5 grid size-9 shrink-0 place-items-center rounded-full bg-club font-mono text-body font-semibold text-on-club"
        >
          {label}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            aria-label={t("titleLabel", { label })}
            placeholder={t(`titlePlaceholder.${block.kind}`)}
            value={block.title}
            maxLength={80}
            readOnly={readOnly}
            aria-invalid={errors.title ? true : undefined}
            onChange={(e) => onChange({ title: e.target.value })}
            className="h-12 w-full rounded-field border border-transparent bg-transparent px-2 text-title3 text-ink outline-none transition-colors placeholder:text-muted hover:border-control focus:border-club focus:bg-surface"
          />
          {errors.title ? <p className="px-2 text-secondary text-danger">{errors.title}</p> : null}
        </div>
        {readOnly ? null : (
          <Menu
            label={t("actions", { label })}
            trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
            triggerClassName="text-muted hover:bg-raised hover:text-ink"
          >
            <MenuItem icon={<Icon.Copy size={20} aria-hidden="true" />} onClick={onDuplicate}>
              {t("duplicate")}
            </MenuItem>
            {index > 0 ? (
              <MenuItem
                icon={<Icon.ArrowUp size={20} aria-hidden="true" />}
                onClick={() => onMove(-1)}
              >
                {t("up")}
              </MenuItem>
            ) : null}
            {index < count - 1 ? (
              <MenuItem
                icon={<Icon.ArrowDown size={20} aria-hidden="true" />}
                onClick={() => onMove(1)}
              >
                {t("down")}
              </MenuItem>
            ) : null}
            <MenuDivider />
            <MenuItem
              tone="danger"
              icon={<Icon.Trash size={20} aria-hidden="true" />}
              onClick={onRemove}
            >
              {t("remove")}
            </MenuItem>
          </Menu>
        )}
      </header>

      <div role="group" aria-label={t("kind")} className="flex flex-wrap gap-2">
        {WORKOUT_BLOCK_KINDS.map((k) => (
          <Choice key={k} selected={block.kind === k} disabled={readOnly} onClick={() => onKind(k)}>
            {kinds(k)}
          </Choice>
        ))}
      </div>

      <Field label={t("board")} hint={t("boardHint")} error={errors.description}>
        {(id, describedBy) => (
          <AutoTextarea
            id={id}
            rows={3}
            maxLength={2000}
            readOnly={readOnly}
            aria-describedby={describedBy}
            aria-invalid={errors.description ? true : undefined}
            placeholder={t(`boardPlaceholder.${block.kind}`)}
            value={block.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className="font-mono"
          />
        )}
      </Field>

      {showFormats ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-secondary font-medium text-ink">{t("format")}</span>
            {block.kind === "wod" && !readOnly ? (
              <Button
                variant="tertiary"
                size="sm"
                icon={<Icon.Medal size={18} aria-hidden="true" />}
                onClick={onBenchmark}
              >
                {t("useBenchmark")}
              </Button>
            ) : null}
          </div>
          <div role="group" aria-label={t("format")} className="flex flex-wrap gap-2">
            {FORMATS_BY_KIND[block.kind].map((f: Format) => (
              <Choice
                key={f}
                selected={block.format === f}
                disabled={readOnly}
                onClick={() => onChange({ format: f })}
              >
                {formats(f)}
              </Choice>
            ))}
          </div>
          <p className="text-secondary text-muted">{formats(`${block.format}Hint`)}</p>

          {needsMinutes || optionalMinutes ? (
            <div className="max-w-56">
              <Field
                label={needsMinutes ? t("duration") : t("cap")}
                hint={needsMinutes ? undefined : t("capHint")}
                error={errors.minutes}
              >
                {(id, describedBy) => (
                  <div className="relative">
                    <Input
                      id={id}
                      inputMode="decimal"
                      readOnly={readOnly}
                      aria-describedby={describedBy}
                      aria-invalid={errors.minutes ? true : undefined}
                      value={block.minutes}
                      placeholder={needsMinutes ? "20" : "12"}
                      onChange={(e) => onChange({ minutes: e.target.value })}
                      className="pr-14 font-mono"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-secondary text-muted">
                      {t("minutesUnit")}
                    </span>
                  </div>
                )}
              </Field>
            </div>
          ) : null}

          {strength ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
              <Field label={t("movement")} error={errors.movement}>
                {(id, describedBy) => (
                  <Select
                    id={id}
                    disabled={readOnly}
                    aria-describedby={describedBy}
                    aria-invalid={errors.movement ? true : undefined}
                    value={block.movementCode}
                    onChange={(e) => onChange({ movementCode: e.target.value })}
                  >
                    <option value="">{t("chooseMovement")}</option>
                    {movements.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {block.format === "percent" ? (
                <Field label={t("percent")} hint={t("percentHint")} error={errors.percent}>
                  {(id, describedBy) => (
                    <div className="relative">
                      <Input
                        id={id}
                        inputMode="numeric"
                        readOnly={readOnly}
                        aria-describedby={describedBy}
                        aria-invalid={errors.percent ? true : undefined}
                        value={block.percent}
                        placeholder="75"
                        onChange={(e) => onChange({ percent: e.target.value.replace(/\D/g, "") })}
                        className="pr-10 font-mono"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-secondary text-muted">
                        %
                      </span>
                    </div>
                  )}
                </Field>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-secondary font-medium text-ink">{t("rm")}</span>
                  <div role="group" aria-label={t("rm")} className="flex flex-wrap gap-1.5">
                    {REP_MAXES.map((n) => (
                      <Choice
                        key={n}
                        selected={block.rmReps === String(n)}
                        disabled={readOnly}
                        onClick={() => onChange({ rmReps: String(n) })}
                      >
                        {`${n}RM`}
                      </Choice>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : readOnly ? null : (
        <div>
          <Button
            variant="tertiary"
            size="sm"
            action="add"
            onClick={() => {
              setScoring(true);
              onChange({ format: "for_time" });
            }}
          >
            {t("addScore")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={levels}
          onClick={() => setLevels((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-control px-1 text-secondary font-medium text-club-text"
        >
          <Icon.CaretDown
            size={16}
            aria-hidden="true"
            className={`transition-transform ${levels ? "" : "-rotate-90"}`}
          />
          {block.scaled || block.rx || block.rxPlus ? t("levelsFilled") : t("levels")}
        </button>
        {levels ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["scaled", "Scaled"],
                ["rx", "RX"],
                ["rxPlus", "RX+"],
              ] as const
            ).map(([key, name]) => (
              <Field key={key} label={name} error={key === "rx" ? errors.levels : undefined}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={400}
                    readOnly={readOnly}
                    value={block[key]}
                    placeholder={t(`levelPlaceholder.${key}`)}
                    onChange={(e) => onChange({ [key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Atajos para añadir un bloque con su tipo y su formato de partida. */
export function AddBlockBar({
  onAdd,
  disabled,
}: {
  onAdd: (kind: WorkoutBlockKind) => void;
  disabled: boolean;
}) {
  const t = useT("fitness.staff.editor");
  const kinds = useT("fitness.common.blockKinds");
  const main: WorkoutBlockKind[] = ["warmup", "strength", "wod", "accessory"];
  const rest = WORKOUT_BLOCK_KINDS.filter((k) => !main.includes(k));
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("addBlock")}>
      {main.map((k) => (
        <Button
          key={k}
          variant="secondary"
          size="sm"
          action="add"
          disabled={disabled}
          onClick={() => onAdd(k)}
        >
          {kinds(k)}
        </Button>
      ))}
      <Menu
        label={t("moreBlocks")}
        trigger={<Icon.DotsThree size={22} aria-hidden="true" />}
        triggerClassName="text-muted hover:bg-raised hover:text-ink"
      >
        {rest.map((k) => (
          <MenuItem
            key={k}
            icon={<Icon.Plus size={20} aria-hidden="true" />}
            onClick={() => onAdd(k)}
          >
            {kinds(k)}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

/** Los benchmarks del catálogo, por familia: se elige uno y llena el bloque WOD. */
export function BenchmarkSheet({
  onPick,
  onClose,
}: {
  onPick: (b: BenchmarkEntry) => void;
  onClose: () => void;
}) {
  const t = useT("fitness.staff.editor.benchmarks");
  const c = useT("fitness.common");
  const { locale } = useLocale();
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("hint")}
    >
      <div className="flex flex-col gap-5">
        {BENCHMARK_FAMILIES.map((family) => {
          const items = BENCHMARKS.filter((b) => b.family === family);
          if (items.length === 0) return null;
          return (
            <section key={family} className="flex flex-col gap-2">
              <h3 className="text-label uppercase tracking-wide text-muted">
                {t(`family.${family}`)}
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((b) => (
                  <li key={b.code}>
                    <button
                      type="button"
                      onClick={() => onPick(b)}
                      className="flex w-full min-h-14 flex-col gap-0.5 rounded-field bg-raised px-4 py-3 text-left transition-colors hover:bg-page"
                    >
                      <span className="font-medium text-ink">{b.name}</span>
                      <span className="text-secondary text-muted">{b.description[locale]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Programar la publicación para un día y una hora. */
export function ScheduleSheet({
  initialDate,
  initialTime,
  onSchedule,
  onClose,
  busy,
}: {
  initialDate: string;
  initialTime: string;
  onSchedule: (date: string, time: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const t = useT("fitness.staff.editor.schedule");
  const c = useT("fitness.common");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("hint")}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            icon={<Icon.Clock size={20} aria-hidden="true" />}
            loading={busy}
            disabled={!date || !time}
            onClick={() => onSchedule(date, time)}
          >
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("date")}>
          {(id) => (
            <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </Field>
        <Field label={t("time")}>
          {(id) => (
            <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
