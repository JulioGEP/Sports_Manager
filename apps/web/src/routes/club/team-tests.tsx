import {
  PHYSICAL_TEST_DIRECTIONS,
  PHYSICAL_TEST_UNITS,
  PhysicalTestsResponseSchema,
  TeamTestsResponseSchema,
  type PhysicalTestDirection,
  type PhysicalTestDto,
  type PhysicalTestUnit,
  type TeamTestsResponse,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useParams } from "react-router";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  Card,
  DataList,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
  type Column,
  type RowAction,
} from "@/ui";

type TestPlayer = TeamTestsResponse["players"][number];
type Result = TeamTestsResponse["results"][number];

/**
 * Tests físicos del equipo (Bloque 25, ADR 0039): el último valor de cada jugador en cada test
 * activo, el registro de una medición (un test, una fecha, el valor de cada uno) y, para quien
 * gestiona la biblioteca, el catálogo de tests del club.
 */
export function TeamTestsPage() {
  const t = useT("tests");
  const u = useT("testUnits");
  const c = useT("common");
  const errors = useT("errors");
  const intl = useIntl();
  const dates = useDates();
  const client = useQueryClient();
  const { id = "" } = useParams();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [recording, setRecording] = useState(false);

  const query = useQuery({
    queryKey: ["org", slug, "team", id, "physical-tests"],
    queryFn: () =>
      apiFetch(`/api/org/teams/${id}/physical-tests`, { schema: TeamTestsResponseSchema }),
    retry: false,
  });
  const catalog = useQuery({
    queryKey: ["org", slug, "physical-tests"],
    queryFn: () => apiFetch("/api/org/physical-tests", { schema: PhysicalTestsResponseSchema }),
    retry: false,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (query.isError) {
    const notFound = query.error instanceof ApiClientError && query.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(query.error))}</Alert>
    );
  }
  if (!query.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const { team, tests, players, results, access } = query.data;
  const active = tests.filter((test) => test.status === "active");
  // El último resultado de cada jugador en cada test.
  const latest = new Map<string, Result>();
  for (const r of results) {
    const key = `${r.playerId}:${r.testId}`;
    const prev = latest.get(key);
    if (!prev || prev.date <= r.date) latest.set(key, r);
  }
  const valueOf = (playerId: string, test: PhysicalTestDto) => {
    const r = latest.get(`${playerId}:${test.id}`);
    if (!r) return <span className="text-muted">—</span>;
    return (
      <span title={t("lastOn", { date: dates.day(r.date) })}>
        {intl.formatNumber(r.value, { maximumFractionDigits: 2 })} {u(test.unit)}
      </span>
    );
  };
  const measured = (p: TestPlayer) =>
    active.filter((test) => latest.has(`${p.playerId}:${test.id}`));

  const columns: Column<TestPlayer>[] = [
    {
      key: "player",
      header: t("player"),
      cell: (p) => (
        <Link to={paths.playerPerformance(p.playerId)} className="font-medium text-ink">
          {p.shirtNumber !== null ? `${p.shirtNumber}. ` : ""}
          {p.name}
        </Link>
      ),
    },
    ...active.map((test): Column<TestPlayer> => ({
      key: test.id,
      header: test.name,
      numeric: true,
      cell: (p) => valueOf(p.playerId, test),
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.teamTraining(id)}
        backLabel={t("backToWeek")}
        eyebrow={team.name}
        title={t("title")}
        description={t("description")}
        actions={
          access.write && active.length > 0 && players.length > 0 ? (
            <Button action="add" onClick={() => setRecording(true)}>
              {t("record")}
            </Button>
          ) : null
        }
      />

      <Card
        title={t("results")}
        description={t("resultsDescription", { count: results.length })}
        padded={false}
      >
        <DataList<TestPlayer>
          caption={t("results")}
          rows={players}
          getKey={(p) => p.playerId}
          empty={<EmptyState icon={<Icon.Users />} title={t("noPlayers")} />}
          href={(p) => paths.playerPerformance(p.playerId)}
          columns={columns}
          mobileRow={(p) => {
            const done = measured(p);
            return {
              title: <Link to={paths.playerPerformance(p.playerId)}>{p.name}</Link>,
              subtitle:
                done.length > 0
                  ? done
                      .map((test) => {
                        const r = latest.get(`${p.playerId}:${test.id}`)!;
                        return `${test.name}: ${intl.formatNumber(r.value, { maximumFractionDigits: 2 })} ${u(test.unit)}`;
                      })
                      .join(" · ")
                  : t("measured", { count: 0 }),
              trailing:
                p.shirtNumber !== null ? (
                  <span className="font-mono text-secondary text-muted">{p.shirtNumber}</span>
                ) : null,
            };
          }}
        />
        {results.length === 0 && players.length > 0 ? (
          <EmptyState
            icon={<Icon.SportIcons.PruebaFisica />}
            title={t("empty")}
            description={t("emptyHint")}
            action={
              access.write && active.length > 0 ? (
                <Button
                  action="add"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRecording(true)}
                >
                  {t("record")}
                </Button>
              ) : null
            }
          />
        ) : null}
      </Card>

      {catalog.data?.access.manage ? (
        <TestCatalog tests={catalog.data.tests} onChanged={() => void reload()} />
      ) : null}

      {access.write ? (
        <RecordSheet
          open={recording}
          teamId={team.id}
          tests={active}
          players={players}
          onClose={() => setRecording(false)}
          onSaved={() => void reload()}
        />
      ) : null}
    </div>
  );
}

/** Una medición: un test, una fecha y el valor de cada jugador; quien no lo hizo, en blanco. */
function RecordSheet({
  open,
  teamId,
  tests,
  players,
  onClose,
  onSaved,
}: {
  open: boolean;
  teamId: string;
  tests: PhysicalTestDto[];
  players: TestPlayer[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("tests.recordSheet");
  const units = useT("testUnits");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [testId, setTestId] = useState(tests[0]?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const test = tests.find((x) => x.id === testId) ?? tests[0];
  const filled = players
    .map((p) => ({
      playerId: p.playerId,
      raw: (values[p.playerId] ?? "").replace(",", ".").trim(),
    }))
    .filter((v) => v.raw !== "" && Number.isFinite(Number(v.raw)) && Number(v.raw) >= 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!test || filled.length === 0) return;
    setBusy(true);
    try {
      await apiFetch(`/api/org/teams/${teamId}/physical-tests/results`, {
        method: "POST",
        body: {
          testId: test.id,
          date,
          results: filled.map((v) => ({ playerId: v.playerId, value: Number(v.raw) })),
        },
        schema: TeamTestsResponseSchema,
      });
      toast("success", t("saved", { count: filled.length }));
      setValues({});
      onClose();
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action="save"
            type="submit"
            form="record-tests-form"
            loading={busy}
            disabled={filled.length === 0}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="record-tests-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("test")}>
            {(id) => (
              <Select id={id} value={test?.id ?? ""} onChange={(e) => setTestId(e.target.value)}>
                {tests.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("date")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-secondary font-medium text-ink">
            {t("values", { unit: test ? units(test.unit) : "" })}
          </legend>
          {players.map((p) => (
            <label key={p.playerId} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-body text-ink">
                {p.shirtNumber !== null ? `${p.shirtNumber}. ` : ""}
                {p.name}
              </span>
              <Input
                className="w-32 font-mono"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                aria-label={t("value", { name: p.name })}
                value={values[p.playerId] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [p.playerId]: e.target.value }))}
              />
            </label>
          ))}
        </fieldset>
      </form>
    </Sheet>
  );
}

/** Catálogo de tests del club: alta, edición y archivo. Archivar no borra resultados. */
function TestCatalog({ tests, onChanged }: { tests: PhysicalTestDto[]; onChanged: () => void }) {
  const t = useT("tests.catalog");
  const units = useT("tests.units");
  const dirs = useT("testDirections");
  const errors = useT("errors");
  const toast = useToast();
  const [editing, setEditing] = useState<PhysicalTestDto | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(test: PhysicalTestDto) {
    setBusy(test.id);
    const status = test.status === "active" ? "archived" : "active";
    try {
      await apiFetch(`/api/org/physical-tests/${test.id}`, {
        method: "PATCH",
        body: { status },
        schema: PhysicalTestsResponseSchema,
      });
      toast("success", status === "archived" ? t("archivedToast") : t("restoredToast"));
      onChanged();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title={t("title")}
      description={t("description")}
      padded={false}
      actions={
        <Button action="add" variant="secondary" size="sm" onClick={() => setEditing("new")}>
          {t("add")}
        </Button>
      }
    >
      <DataList<PhysicalTestDto>
        caption={t("title")}
        rows={tests}
        getKey={(x) => x.id}
        empty={null}
        columns={[
          {
            key: "name",
            header: t("name"),
            cell: (x) => (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{x.name}</span>
                {x.status === "archived" ? (
                  <StatusChip kind="neutral">{t("archived")}</StatusChip>
                ) : null}
              </span>
            ),
          },
          { key: "unit", header: t("unit"), cell: (x) => units(x.unit) },
          { key: "direction", header: t("direction"), cell: (x) => dirs(x.direction) },
        ]}
        mobileRow={(x) => ({
          title: x.name,
          subtitle: `${units(x.unit)} · ${dirs(x.direction)}`,
          trailing:
            x.status === "archived" ? (
              <StatusChip kind="neutral">{t("archived")}</StatusChip>
            ) : null,
        })}
        rowActions={(x): RowAction[] => [
          { key: "edit", label: t("edit"), action: "edit", onClick: () => setEditing(x) },
          x.status === "active"
            ? {
                key: "archive",
                label: t("archive"),
                action: "archive",
                loading: busy === x.id,
                onClick: () => void toggle(x),
              }
            : {
                key: "restore",
                label: t("restore"),
                action: "restore",
                loading: busy === x.id,
                onClick: () => void toggle(x),
              },
        ]}
      />
      <TestSheet
        test={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </Card>
  );
}

function TestSheet({
  test,
  onClose,
  onSaved,
}: {
  test: PhysicalTestDto | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = test !== null;
  const editing = test !== null && test !== "new" ? test : null;
  return open ? (
    <TestForm key={editing?.id ?? "new"} test={editing} onClose={onClose} onSaved={onSaved} />
  ) : null;
}

function TestForm({
  test,
  onClose,
  onSaved,
}: {
  test: PhysicalTestDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("tests.catalog");
  const units = useT("tests.units");
  const dirs = useT("testDirections");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const [name, setName] = useState(test?.name ?? "");
  const [unit, setUnit] = useState<PhysicalTestUnit>(test?.unit ?? "s");
  const [direction, setDirection] = useState<PhysicalTestDirection>(
    test?.direction ?? "lower_better",
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(test ? `/api/org/physical-tests/${test.id}` : "/api/org/physical-tests", {
        method: test ? "PATCH" : "POST",
        body: { name: name.trim(), unit, direction },
        schema: PhysicalTestsResponseSchema,
      });
      toast("success", test ? t("updated") : t("created"));
      onSaved();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={c("close")}
      title={test ? t("editTitle") : t("newTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button
            action={test ? "save" : "add"}
            type="submit"
            form="physical-test-form"
            loading={busy}
            disabled={!name.trim()}
          >
            {c("save")}
          </Button>
        </>
      }
    >
      <form
        id="physical-test-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => void submit(e)}
      >
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("unit")}>
            {(id) => (
              <Select
                id={id}
                value={unit}
                onChange={(e) => setUnit(e.target.value as PhysicalTestUnit)}
              >
                {PHYSICAL_TEST_UNITS.map((x) => (
                  <option key={x} value={x}>
                    {units(x)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("direction")}>
            {(id) => (
              <Select
                id={id}
                value={direction}
                onChange={(e) => setDirection(e.target.value as PhysicalTestDirection)}
              >
                {PHYSICAL_TEST_DIRECTIONS.map((x) => (
                  <option key={x} value={x}>
                    {dirs(x)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
