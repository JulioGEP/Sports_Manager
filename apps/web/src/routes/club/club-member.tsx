import {
  CLUB_MEMBER_STATUSES,
  ClubMemberResponseSchema,
  FeeChargesResponseSchema,
  MemberTypesResponseSchema,
  PERSON_GENDERS,
  PersonResponseSchema,
  personDisplayName,
  type ClubMember,
  type ClubMemberStatus,
  type FeeCharge,
  type Person,
  type PersonGender,
} from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ChargeSheet, FeeStatusChip, money, PaymentSheet } from "@/components/fees";
import { ApiClientError, apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useDates } from "@/lib/dates";
import { useT } from "@/lib/intl";
import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  DataList,
  Definitions,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Sheet,
  StatusChip,
  useToast,
  type RowAction,
} from "@/ui";
import { memberStatusKind } from "./club-members";

/** Ficha de un socio (Bloque 14): la persona, la ficha de socio, sus papeles y sus cuotas. */
export function ClubMemberPage() {
  const t = useT("clubMember");
  const ms = useT("memberStatus");
  const genders = useT("genders");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const dates = useDates();
  const client = useQueryClient();
  const { id = "" } = useParams();
  const { org, slug } = useReadyClub();
  const paths = clubPaths(slug);
  const permissions = org.actor.permissions;
  const canWrite = permissions.includes("org.club_members.write");
  const canFees = permissions.includes("org.fees.read");
  const canFeesWrite = permissions.includes("org.fees.write");
  const [editingPerson, setEditingPerson] = useState(false);
  const [editingMember, setEditingMember] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paying, setPaying] = useState<FeeCharge | null>(null);
  const [charging, setCharging] = useState(false);

  const detail = useQuery({
    queryKey: ["org", slug, "club-member", id],
    queryFn: () => apiFetch(`/api/org/club-members/${id}`, { schema: ClubMemberResponseSchema }),
    retry: false,
  });
  const personId = detail.data?.member.person.id;
  const charges = useQuery({
    queryKey: ["org", slug, "fees", "charges", "person", personId],
    queryFn: () =>
      apiFetch(`/api/org/fees/charges?person=${personId}`, { schema: FeeChargesResponseSchema }),
    enabled: canFees && Boolean(personId),
  });
  const reload = () => client.invalidateQueries({ queryKey: ["org", slug] });

  if (detail.isError) {
    const notFound = detail.error instanceof ApiClientError && detail.error.status === 404;
    return (
      <Alert kind="error">{notFound ? errors("not_found") : errors(errorKey(detail.error))}</Alert>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={c("loading")}>
        <div className="h-8 w-2/5 animate-pulse rounded-chip bg-raised" />
        <div className="h-64 animate-pulse rounded-card bg-raised" />
      </div>
    );
  }
  const member = detail.data.member;
  const person = member.person;
  const name = personDisplayName(person);

  async function leave() {
    setLeaving(false);
    try {
      await apiFetch(`/api/org/club-members/${id}`, {
        method: "PATCH",
        body: { status: "left" },
        schema: ClubMemberResponseSchema,
      });
      toast("success", t("left", { name }));
      void reload();
    } catch (err) {
      toast("error", errors(errorKey(err)));
    }
  }

  const age = dates.age(person.birthDate);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        backTo={paths.clubMembers}
        backLabel={t("back")}
        eyebrow={t("eyebrow", {
          number: member.memberNumber,
          type: member.memberType?.name ?? t("noType"),
        })}
        title={
          <>
            <Avatar name={name} size="lg" src={person.photoUrl} />
            {name}
            <StatusChip kind={memberStatusKind[member.status]}>{ms(member.status)}</StatusChip>
          </>
        }
        actions={
          canWrite ? (
            <>
              <Button action="edit" variant="secondary" onClick={() => setEditingMember(true)}>
                {t("editMember")}
              </Button>
              {member.status !== "left" ? (
                <Button action="deactivate" variant="danger" onClick={() => setLeaving(true)}>
                  {t("leave")}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t("person.title")}
          actions={
            canWrite ? (
              <Button
                action="edit"
                variant="secondary"
                size="sm"
                onClick={() => setEditingPerson(true)}
              >
                {t("person.edit")}
              </Button>
            ) : null
          }
        >
          <Definitions
            items={[
              {
                term: t("person.birthDate"),
                detail: person.birthDate
                  ? `${dates.day(person.birthDate)}${age !== null ? ` · ${t("person.age", { age })}` : ""}`
                  : t("person.unknown"),
              },
              {
                term: t("person.gender"),
                detail: person.gender ? genders(person.gender) : t("person.unknown"),
              },
              { term: t("person.email"), detail: person.email ?? t("person.unknown") },
              { term: t("person.phone"), detail: person.phone ?? t("person.unknown") },
              { term: t("person.nationalId"), detail: person.nationalId ?? t("person.unknown") },
              {
                term: t("person.account"),
                detail: person.userId ? t("person.hasAccount") : t("person.noAccount"),
              },
              ...(person.notes ? [{ term: t("person.notes"), detail: person.notes }] : []),
            ]}
          />
        </Card>

        <Card title={t("member.title")}>
          <Definitions
            items={[
              { term: t("member.number"), detail: member.memberNumber },
              { term: t("member.type"), detail: member.memberType?.name ?? t("noType") },
              { term: t("member.status"), detail: ms(member.status) },
              { term: t("member.joinedOn"), detail: dates.day(member.joinedOn) },
              ...(member.leftOn
                ? [{ term: t("member.leftOn"), detail: dates.day(member.leftOn) }]
                : []),
            ]}
          />
        </Card>

        <Card title={t("roles.title")} description={t("roles.description")}>
          <ul className="flex flex-col gap-2">
            {member.roles.player ? (
              <li className="flex items-center gap-3">
                <Icon.PersonSimpleRun
                  size={20}
                  weight="duotone"
                  aria-hidden="true"
                  className="text-club-text"
                />
                <Link to={paths.player(member.roles.player.id)}>{t("roles.player")}</Link>
              </li>
            ) : null}
            {member.roles.guardianOf.map((g) => (
              <li key={g.playerId} className="flex items-center gap-3">
                <Icon.HandHeart
                  size={20}
                  weight="duotone"
                  aria-hidden="true"
                  className="text-club-text"
                />
                <span>
                  {t("roles.guardianOf")}{" "}
                  {permissions.includes("org.players.read") ? (
                    <Link to={paths.player(g.playerId)}>{g.name}</Link>
                  ) : (
                    g.name
                  )}
                </span>
              </li>
            ))}
            {member.roles.staff ? (
              <li className="flex items-center gap-3">
                <Icon.Users
                  size={20}
                  weight="duotone"
                  aria-hidden="true"
                  className="text-club-text"
                />
                <Link to={paths.staff}>{t("roles.staff")}</Link>
              </li>
            ) : null}
            {!member.roles.player && member.roles.guardianOf.length === 0 && !member.roles.staff ? (
              <li className="text-muted">{t("roles.none")}</li>
            ) : null}
          </ul>
        </Card>

        {canFees ? (
          <Card
            title={t("fees.title")}
            description={
              charges.data
                ? t("fees.summary", {
                    pending: money(
                      charges.data.totals.pendingCents + charges.data.totals.overdueCents,
                    ),
                    paid: money(charges.data.totals.paidCents),
                  })
                : undefined
            }
            padded={false}
            actions={
              canFeesWrite ? (
                <Button
                  action="add"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCharging(true)}
                >
                  {t("fees.newCharge")}
                </Button>
              ) : null
            }
          >
            <DataList<FeeCharge>
              caption={t("fees.title")}
              rows={charges.data?.charges ?? []}
              getKey={(ch) => ch.id}
              empty={
                <EmptyState
                  icon={<Icon.Coins weight="duotone" />}
                  title={charges.isPending ? c("loading") : t("fees.empty")}
                />
              }
              columns={[
                {
                  key: "concept",
                  header: t("fees.concept"),
                  cell: (ch) => (
                    <span className="flex flex-col">
                      <span className="font-medium text-ink">{ch.concept}</span>
                      {ch.periodLabel ? (
                        <span className="text-secondary text-muted">{ch.periodLabel}</span>
                      ) : null}
                    </span>
                  ),
                },
                { key: "due", header: t("fees.dueOn"), cell: (ch) => dates.day(ch.dueOn) },
                {
                  key: "amount",
                  header: t("fees.amount"),
                  numeric: true,
                  cell: (ch) => money(ch.amountCents),
                },
                {
                  key: "paid",
                  header: t("fees.paid"),
                  numeric: true,
                  cell: (ch) => money(ch.paidCents),
                },
                {
                  key: "status",
                  header: t("fees.status"),
                  cell: (ch) => <FeeStatusChip status={ch.status} />,
                },
              ]}
              mobileRow={(ch) => ({
                title: ch.concept,
                subtitle: `${dates.day(ch.dueOn)} · ${money(ch.amountCents)}`,
                trailing: <FeeStatusChip status={ch.status} />,
              })}
              rowActions={
                canFeesWrite
                  ? (ch): RowAction[] =>
                      ch.status === "pending" || ch.status === "overdue"
                        ? [
                            {
                              key: "pay",
                              label: t("fees.pay"),
                              action: "pay",
                              tone: "primary",
                              onClick: () => setPaying(ch),
                            },
                          ]
                        : []
                  : undefined
              }
            />
          </Card>
        ) : null}
      </div>

      {canWrite ? (
        <>
          <PersonSheet
            open={editingPerson}
            person={person}
            onClose={() => setEditingPerson(false)}
            onSaved={() => void reload()}
          />
          <MemberSheet
            open={editingMember}
            member={member}
            onClose={() => setEditingMember(false)}
            onSaved={() => void reload()}
          />
          <ConfirmDialog
            open={leaving}
            title={t("confirmLeaveTitle", { name })}
            body={t("confirmLeaveBody")}
            confirmLabel={t("leave")}
            confirmAction="deactivate"
            cancelLabel={c("cancel")}
            onConfirm={() => void leave()}
            onCancel={() => setLeaving(false)}
          />
        </>
      ) : null}
      {canFeesWrite ? (
        <>
          <PaymentSheet
            charge={paying}
            onClose={() => setPaying(null)}
            onSaved={() => void reload()}
          />
          <ChargeSheet
            open={charging}
            person={{ id: person.id, name }}
            onClose={() => setCharging(false)}
            onSaved={() => void reload()}
          />
        </>
      ) : null}
    </div>
  );
}

/** Datos de la persona: nombre, nacimiento, contacto, documento y notas. */
export function PersonSheet({
  open,
  person,
  onClose,
  onSaved,
}: {
  open: boolean;
  person: Person;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("clubMember.personSheet");
  const c = useT("common");
  const genders = useT("genders");
  const errors = useT("errors");
  const toast = useToast();
  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [birthDate, setBirthDate] = useState(person.birthDate ?? "");
  const [gender, setGender] = useState<PersonGender | "">(person.gender ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [nationalId, setNationalId] = useState(person.nationalId ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/org/people/${person.id}`, {
        method: "PATCH",
        body: {
          firstName,
          lastName,
          birthDate: birthDate || null,
          gender: gender || null,
          email: email.trim() ? email.trim().toLowerCase() : null,
          phone: phone.trim() || null,
          nationalId: nationalId.trim() || null,
          notes: notes.trim() || null,
        },
        schema: PersonResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
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
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="person-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="person-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
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
        <Field label={t("nationalId")}>
          {(id) => (
            <Input
              id={id}
              maxLength={20}
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("notes")}>
          {(id) => (
            <Input
              id={id}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}

function MemberSheet({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: ClubMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT("clubMember.memberSheet");
  const ms = useT("memberStatus");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const { slug } = useReadyClub();
  const [memberTypeId, setMemberTypeId] = useState(member.memberType?.id ?? "");
  const [memberNumber, setMemberNumber] = useState(String(member.memberNumber));
  const [joinedOn, setJoinedOn] = useState(member.joinedOn);
  const [leftOn, setLeftOn] = useState(member.leftOn ?? "");
  const [status, setStatus] = useState<ClubMemberStatus>(member.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const types = useQuery({
    queryKey: ["org", slug, "member-types"],
    queryFn: () => apiFetch("/api/org/member-types", { schema: MemberTypesResponseSchema }),
    enabled: open,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/org/club-members/${member.id}`, {
        method: "PATCH",
        body: {
          memberTypeId: memberTypeId || null,
          memberNumber: Number(memberNumber),
          joinedOn,
          leftOn: status === "left" ? leftOn || null : null,
          status,
        },
        schema: ClubMemberResponseSchema,
      });
      toast("success", t("saved"));
      onClose();
      onSaved();
    } catch (err) {
      setError(errors(errorKey(err)));
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
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button action="save" type="submit" form="member-form" loading={busy}>
            {c("save")}
          </Button>
        </>
      }
    >
      <form id="member-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("memberType")}>
            {(id) => (
              <Select
                id={id}
                value={memberTypeId}
                onChange={(e) => setMemberTypeId(e.target.value)}
              >
                <option value="">{t("noType")}</option>
                {types.data?.memberTypes.map((mt) => (
                  <option key={mt.id} value={mt.id}>
                    {mt.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("memberNumber")}>
            {(id) => (
              <Input
                id={id}
                required
                inputMode="numeric"
                value={memberNumber}
                onChange={(e) => setMemberNumber(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("status")}>
            {(id) => (
              <Select
                id={id}
                value={status}
                onChange={(e) => setStatus(e.target.value as ClubMemberStatus)}
              >
                {CLUB_MEMBER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ms(s)}
                  </option>
                ))}
              </Select>
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
        {status === "left" ? (
          <Field label={t("leftOn")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={leftOn}
                onChange={(e) => setLeftOn(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
