import {
  CLUB_MEMBER_STATUSES,
  ClubMemberResponseSchema,
  ClubMembersResponseSchema,
  PERSON_GENDERS,
  PeopleResponseSchema,
  personDisplayName,
  type ClubMember,
  type ClubMemberStatus,
  type PersonGender,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { money } from "@/components/fees";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import { orgQueries } from "@/lib/queries";
import {
  Alert,
  Avatar,
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
  type StatusKind,
} from "@/ui";

export const memberStatusKind: Record<ClubMemberStatus, StatusKind> = {
  active: "success",
  pending: "info",
  suspended: "warning",
  left: "neutral",
};

/** Socios del club (Bloque 14): número, persona, tipo, papeles, estado y cuotas pendientes. */
export function ClubMembersPage() {
  const t = useT("clubMembers");
  const ms = useT("memberStatus");
  const c = useT("common");
  const errors = useT("errors");
  const dates = useDates();
  const [params, setParams] = useSearchParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const canWrite = org.actor.permissions.includes("org.club_members.write");
  const creating = params.get("new") === "1";
  const rawStatus = params.get("status") ?? "";
  const status: ClubMemberStatus | "" = (CLUB_MEMBER_STATUSES as readonly string[]).includes(
    rawStatus,
  )
    ? (rawStatus as ClubMemberStatus)
    : "";
  const typeFilter = params.get("type") ?? "";
  const [query, setQuery] = useState("");

  const members = useQuery({
    queryKey: ["org", slug, "club-members", status || "all", typeFilter || "all"],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (typeFilter) sp.set("type", typeFilter);
      const qs = sp.toString();
      return apiFetch(`/api/org/club-members${qs ? `?${qs}` : ""}`, {
        schema: ClubMembersResponseSchema,
      });
    },
  });
  const types = useQuery(orgQueries.memberTypes(slug));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members.data?.members ?? []).filter(
      (m) =>
        !q ||
        personDisplayName(m.person).toLowerCase().includes(q) ||
        (m.person.email ?? "").toLowerCase().includes(q) ||
        String(m.memberNumber) === q,
    );
  }, [members.data, query]);

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    setParams(sp, { replace: true });
  }

  const roleChips = (m: ClubMember) => (
    <span className="flex flex-wrap gap-1">
      {m.roles.player ? <StatusChip kind="club">{t("roles.player")}</StatusChip> : null}
      {m.roles.guardianOf.length > 0 ? (
        <StatusChip kind="club">
          {t("roles.guardianOf", { names: m.roles.guardianOf.map((g) => g.name).join(", ") })}
        </StatusChip>
      ) : null}
      {m.roles.staff ? <StatusChip kind="club">{t("roles.staff")}</StatusChip> : null}
      {!m.roles.player && m.roles.guardianOf.length === 0 && !m.roles.staff ? (
        <span className="text-muted">{t("roles.none")}</span>
      ) : null}
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canWrite ? (
            <Button action="add" onClick={() => update({ new: "1" })}>
              {t("new")}
            </Button>
          ) : null
        }
      />
      {members.isError ? <Alert kind="error">{errors(errorKey(members.error))}</Alert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Icon.MagnifyingGlass
            size={20}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            className="pl-11"
            placeholder={t("search")}
            aria-label={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-full max-w-xs">
          <Select
            aria-label={t("statusFilter")}
            value={status}
            onChange={(e) => update({ status: e.target.value || null })}
          >
            <option value="">{t("allStatuses")}</option>
            {CLUB_MEMBER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t("statusFilter")}: {ms(s)}
              </option>
            ))}
          </Select>
        </div>
        {types.data && types.data.memberTypes.length > 0 ? (
          <div className="w-full max-w-xs">
            <Select
              aria-label={t("typeFilter")}
              value={typeFilter}
              onChange={(e) => update({ type: e.target.value || null })}
            >
              <option value="">{t("allTypes")}</option>
              {types.data.memberTypes.map((mt) => (
                <option key={mt.id} value={mt.id}>
                  {t("typeFilter")}: {mt.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      <Card padded={false}>
        <DataList<ClubMember>
          loading={members.isLoading}
          caption={t("title")}
          rows={filtered}
          getKey={(m) => m.id}
          empty={
            <EmptyState
              icon={<Icon.IdentificationCard weight="duotone" />}
              title={
                members.isPending
                  ? c("loading")
                  : (members.data?.members.length ?? 0) > 0
                    ? t("noResults")
                    : t("empty")
              }
              action={
                canWrite && members.data && members.data.members.length === 0 ? (
                  <Button
                    action="add"
                    variant="secondary"
                    size="sm"
                    onClick={() => update({ new: "1" })}
                  >
                    {t("new")}
                  </Button>
                ) : null
              }
            />
          }
          columns={[
            {
              key: "number",
              header: t("table.number"),
              numeric: true,
              cell: (m) => m.memberNumber,
            },
            {
              key: "person",
              header: t("table.person"),
              cell: (m) => (
                <span className="flex items-center gap-3">
                  <Avatar name={personDisplayName(m.person)} size="sm" src={m.person.photoUrl} />
                  <span className="flex min-w-0 flex-col">
                    <Link to={paths.clubMember(m.id)} className="font-medium text-ink">
                      {personDisplayName(m.person)}
                    </Link>
                    <span className="text-secondary text-muted">
                      {m.person.email ?? m.person.phone ?? ""}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: "type",
              header: t("table.type"),
              cell: (m) => m.memberType?.name ?? <span className="text-muted">{t("noType")}</span>,
            },
            { key: "roles", header: t("table.roles"), cell: roleChips },
            {
              key: "status",
              header: t("table.status"),
              cell: (m) => (
                <StatusChip kind={memberStatusKind[m.status]}>{ms(m.status)}</StatusChip>
              ),
            },
            {
              key: "fees",
              header: t("table.fees"),
              numeric: true,
              cell: (m) =>
                m.fees === null ? (
                  <span className="font-sans text-muted">–</span>
                ) : m.fees.pendingCents === 0 ? (
                  <span className="font-sans text-success">{t("upToDate")}</span>
                ) : (
                  <span className={m.fees.overdueCount > 0 ? "text-warning" : ""}>
                    {money(m.fees.pendingCents)}
                  </span>
                ),
            },
            { key: "since", header: t("table.since"), cell: (m) => dates.day(m.joinedOn) },
          ]}
          mobileRow={(m) => ({
            leading: <Avatar name={personDisplayName(m.person)} src={m.person.photoUrl} />,
            title: <Link to={paths.clubMember(m.id)}>{personDisplayName(m.person)}</Link>,
            subtitle: `${t("numberShort", { number: m.memberNumber })} · ${m.memberType?.name ?? t("noType")}${
              m.fees && m.fees.pendingCents > 0 ? ` · ${money(m.fees.pendingCents)}` : ""
            }`,
            trailing: <StatusChip kind={memberStatusKind[m.status]}>{ms(m.status)}</StatusChip>,
          })}
          href={(m) => paths.clubMember(m.id)}
        />
      </Card>
      {canWrite ? (
        <NewMemberSheet
          open={creating}
          types={types.data?.memberTypes.filter((x) => x.status === "active") ?? []}
          onClose={() => update({ new: null })}
        />
      ) : null}
    </div>
  );
}

function NewMemberSheet({
  open,
  types,
  onClose,
}: {
  open: boolean;
  types: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useT("clubMembers.sheet");
  const c = useT("common");
  const genders = useT("genders");
  const errors = useT("errors");
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<PersonGender | "">("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState("");
  const [memberTypeId, setMemberTypeId] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [joinedOn, setJoinedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ["org", slug, "people", query],
    queryFn: () =>
      apiFetch(`/api/org/people?q=${encodeURIComponent(query)}`, { schema: PeopleResponseSchema }),
    enabled: open && mode === "existing" && query.trim().length >= 2,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "existing" && !personId) {
      setError(t("choosePerson"));
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch("/api/org/club-members", {
        method: "POST",
        body: {
          ...(mode === "existing"
            ? { personId }
            : {
                person: {
                  firstName,
                  lastName,
                  birthDate: birthDate || null,
                  gender: gender || null,
                  email: email.trim() ? email.trim().toLowerCase() : null,
                  phone: phone.trim() || null,
                },
              }),
          memberTypeId: memberTypeId || null,
          ...(memberNumber.trim() ? { memberNumber: Number(memberNumber) } : {}),
          joinedOn,
        },
        schema: ClubMemberResponseSchema,
      });
      toast("success", t("created", { name: personDisplayName(created.member.person) }));
      await client.invalidateQueries({ queryKey: ["org", slug] });
      onClose();
      void navigate(paths.clubMember(created.member.id));
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const modeButton = (value: "new" | "existing", label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={`h-11 flex-1 rounded-control px-3 text-secondary font-semibold transition-colors ${
        mode === value ? "bg-club text-on-club" : "text-muted"
      }`}
    >
      {label}
    </button>
  );

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
          <Button action="add" type="submit" form="club-member-form" loading={busy}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="club-member-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div
          role="group"
          aria-label={t("mode")}
          className="flex gap-0.5 rounded-control bg-raised p-0.5"
        >
          {modeButton("new", t("modeNew"))}
          {modeButton("existing", t("modeExisting"))}
        </div>
        {mode === "new" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("firstName")}>
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={60}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("lastName")}>
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={80}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("birthDate")}>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("gender")}>
                {(id) => (
                  <Select
                    id={id}
                    value={gender}
                    onChange={(e) => setGender(e.target.value as PersonGender | "")}
                  >
                    <option value="">{t("noGender")}</option>
                    {PERSON_GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {genders(g)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("email")}>
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("phone")}>
                {(id) => (
                  <Input
                    id={id}
                    type="tel"
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </>
        ) : (
          <Field label={t("person")} hint={t("personHint")}>
            {(id) => (
              <div className="flex flex-col gap-2">
                <Input
                  id={id}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPersonId("");
                  }}
                />
                {people.data && !personId ? (
                  people.data.people.length === 0 ? (
                    <p className="text-secondary text-muted">{t("noPeople")}</p>
                  ) : (
                    <ul className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto rounded-field border border-border">
                      {people.data.people.slice(0, 20).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={p.isMember}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body hover:bg-raised disabled:opacity-60"
                            onClick={() => {
                              setPersonId(p.id);
                              setQuery(personDisplayName(p));
                            }}
                          >
                            <span className="flex min-w-0 flex-col">
                              <span>{personDisplayName(p)}</span>
                              <span className="text-secondary text-muted">{p.email ?? ""}</span>
                            </span>
                            <span className="flex shrink-0 gap-1">
                              {p.isPlayer ? (
                                <StatusChip kind="club">{t("isPlayer")}</StatusChip>
                              ) : null}
                              {p.isMember ? (
                                <StatusChip kind="neutral">{t("isMember")}</StatusChip>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("memberType")}>
            {(id) => (
              <Select
                id={id}
                value={memberTypeId}
                onChange={(e) => setMemberTypeId(e.target.value)}
              >
                <option value="">{t("noType")}</option>
                {types.map((mt) => (
                  <option key={mt.id} value={mt.id}>
                    {mt.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("memberNumber")} hint={t("memberNumberHint")}>
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={memberNumber}
                onChange={(e) => setMemberNumber(e.target.value)}
              />
            )}
          </Field>
          <Field label={t("joinedOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={joinedOn}
                onChange={(e) => setJoinedOn(e.target.value)}
              />
            )}
          </Field>
        </div>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
