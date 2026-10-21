import { schema, type Database } from "@sportsmanager/db";
import type {
  ClubMemberCreate,
  ClubMemberStatus,
  ClubMemberUpdate,
  MemberTypeCreate,
  MemberTypeStatus,
  MemberTypeUpdate,
  PersonCreate,
  PersonGender,
  PersonStatus,
  PersonUpdate,
} from "@sportsmanager/shared";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db.ts";
import type { OrgScope } from "./scope.ts";

/**
 * Personas y socios (Bloque 14, ADR 0031). Una persona por persona física del club; ser socio,
 * deportista, familiar o personal son papeles de esa persona. Datos personales: solo salen con
 * `org.club_members.read` o `org.players.read`. Siempre con ámbito de club (ADR 0015).
 */

export interface PersonRow {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: PersonGender | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  photoBlobKey: string | null;
  notes: string | null;
  status: PersonStatus;
  userId: string | null;
  createdAt: Date;
}

export interface PersonRecord extends PersonRow {
  isMember: boolean;
  isPlayer: boolean;
}

export interface MemberTypeRecord {
  id: string;
  name: string;
  status: MemberTypeStatus;
  sortOrder: number;
  membersCount: number;
}

export interface ClubMemberRecord {
  id: string;
  memberNumber: number;
  status: ClubMemberStatus;
  joinedOn: string;
  leftOn: string | null;
  memberType: { id: string; name: string } | null;
  person: PersonRow;
  roles: {
    player: { id: string } | null;
    guardianOf: { playerId: string; name: string }[];
    staff: boolean;
  };
}

export const personSelection = {
  id: schema.people.id,
  firstName: schema.people.firstName,
  lastName: schema.people.lastName,
  birthDate: schema.people.birthDate,
  gender: schema.people.gender,
  email: schema.people.email,
  phone: schema.people.phone,
  nationalId: schema.people.nationalId,
  photoBlobKey: schema.people.photoBlobKey,
  notes: schema.people.notes,
  status: schema.people.status,
  userId: schema.people.userId,
  createdAt: schema.people.createdAt,
};

interface PersonSelected {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  photoBlobKey: string | null;
  notes: string | null;
  status: string;
  userId: string | null;
  createdAt: Date;
}

export const toPersonRow = (row: PersonSelected): PersonRow => ({
  ...row,
  gender: row.gender as PersonGender | null,
  status: row.status as PersonStatus,
});

function personValues(input: PersonCreate | PersonUpdate) {
  const values: Partial<typeof schema.people.$inferInsert> = {};
  if (input.firstName !== undefined) values.firstName = input.firstName;
  if (input.lastName !== undefined) values.lastName = input.lastName;
  if (input.birthDate !== undefined) values.birthDate = input.birthDate;
  if (input.gender !== undefined) values.gender = input.gender;
  if (input.email !== undefined) values.email = input.email;
  if (input.phone !== undefined) values.phone = input.phone?.trim() ? input.phone.trim() : null;
  if (input.nationalId !== undefined)
    values.nationalId = input.nationalId?.trim() ? input.nationalId.trim() : null;
  if (input.notes !== undefined) values.notes = input.notes?.trim() ? input.notes.trim() : null;
  if ("status" in input && input.status !== undefined) values.status = input.status;
  return values;
}

export function peopleRepo(db: () => Database) {
  async function byId(scope: OrgScope, id: string): Promise<PersonRow | null> {
    const rows = await db()
      .select(personSelection)
      .from(schema.people)
      .where(and(eq(schema.people.organizationId, scope.organizationId), eq(schema.people.id, id)))
      .limit(1);
    return rows[0] ? toPersonRow(rows[0]) : null;
  }

  async function byUser(scope: OrgScope, userId: string): Promise<PersonRow | null> {
    const rows = await db()
      .select(personSelection)
      .from(schema.people)
      .where(
        and(
          eq(schema.people.organizationId, scope.organizationId),
          eq(schema.people.userId, userId),
        ),
      )
      .limit(1);
    return rows[0] ? toPersonRow(rows[0]) : null;
  }

  return {
    byId,
    byUser,

    /** Búsqueda por nombre para dar de alta a alguien que ya existe, con sus papeles actuales. */
    async search(
      scope: OrgScope,
      filter: { query?: string | undefined; limit?: number | undefined } = {},
    ): Promise<PersonRecord[]> {
      const conditions = [eq(schema.people.organizationId, scope.organizationId)];
      const q = filter.query?.trim();
      if (q) {
        const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        conditions.push(
          or(
            ilike(schema.people.firstName, pattern),
            ilike(schema.people.lastName, pattern),
            ilike(sql`${schema.people.firstName} || ' ' || ${schema.people.lastName}`, pattern),
            ilike(schema.people.email, pattern),
          )!,
        );
      }
      const rows = await db()
        .select({
          ...personSelection,
          playerId: schema.players.id,
          memberId: schema.clubMembers.id,
        })
        .from(schema.people)
        .leftJoin(schema.players, eq(schema.players.personId, schema.people.id))
        .leftJoin(
          schema.clubMembers,
          and(
            eq(schema.clubMembers.personId, schema.people.id),
            inArray(schema.clubMembers.status, ["active", "pending", "suspended"]),
          ),
        )
        .where(and(...conditions))
        .orderBy(asc(schema.people.lastName), asc(schema.people.firstName))
        .limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
      return rows.map(({ playerId, memberId, ...row }) => ({
        ...toPersonRow(row),
        isPlayer: playerId !== null,
        isMember: memberId !== null,
      }));
    },

    async create(scope: OrgScope, input: PersonCreate): Promise<PersonRow> {
      const rows = await db()
        .insert(schema.people)
        .values({
          organizationId: scope.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          ...personValues(input),
        })
        .returning(personSelection);
      return toPersonRow(rows[0]!);
    },

    async update(scope: OrgScope, id: string, patch: PersonUpdate): Promise<PersonRow | null> {
      const values = personValues(patch);
      if (Object.keys(values).length === 0) return byId(scope, id);
      const rows = await db()
        .update(schema.people)
        .set(values)
        .where(
          and(eq(schema.people.organizationId, scope.organizationId), eq(schema.people.id, id)),
        )
        .returning(personSelection);
      return rows[0] ? toPersonRow(rows[0]) : null;
    },

    /**
     * La persona de una cuenta del club; si no existe, la crea con el nombre y el email de la
     * cuenta. Así una familia que acepta una invitación ya es una persona que puede ser socia.
     */
    async ensureForUser(
      scope: OrgScope,
      user: { id: string; name: string; email: string },
    ): Promise<PersonRow> {
      const existing = await byUser(scope, user.id);
      if (existing) return existing;
      const [first, ...rest] = user.name.trim().split(/\s+/);
      try {
        const rows = await db()
          .insert(schema.people)
          .values({
            organizationId: scope.organizationId,
            firstName: first || user.name,
            lastName: rest.join(" ") || "·",
            email: user.email.toLowerCase(),
            userId: user.id,
          })
          .returning(personSelection);
        return toPersonRow(rows[0]!);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return (await byUser(scope, user.id))!;
      }
    },
  };
}

export function memberTypesRepo(db: () => Database) {
  async function list(scope: OrgScope): Promise<MemberTypeRecord[]> {
    const rows = await db()
      .select({
        id: schema.memberTypes.id,
        name: schema.memberTypes.name,
        status: schema.memberTypes.status,
        sortOrder: schema.memberTypes.sortOrder,
        membersCount: count(schema.clubMembers.id),
      })
      .from(schema.memberTypes)
      .leftJoin(
        schema.clubMembers,
        and(
          eq(schema.clubMembers.memberTypeId, schema.memberTypes.id),
          eq(schema.clubMembers.status, "active"),
        ),
      )
      .where(eq(schema.memberTypes.organizationId, scope.organizationId))
      .groupBy(schema.memberTypes.id)
      .orderBy(asc(schema.memberTypes.sortOrder), asc(schema.memberTypes.name));
    return rows.map((row) => ({ ...row, status: row.status as MemberTypeStatus }));
  }

  return {
    list,

    async byId(scope: OrgScope, id: string): Promise<MemberTypeRecord | null> {
      return (await list(scope)).find((t) => t.id === id) ?? null;
    },

    async create(
      scope: OrgScope,
      input: MemberTypeCreate,
    ): Promise<{ outcome: "created"; memberType: MemberTypeRecord } | { outcome: "name_taken" }> {
      const last = await db()
        .select({ max: sql<number>`coalesce(max(${schema.memberTypes.sortOrder}), 0)` })
        .from(schema.memberTypes)
        .where(eq(schema.memberTypes.organizationId, scope.organizationId));
      try {
        const rows = await db()
          .insert(schema.memberTypes)
          .values({
            organizationId: scope.organizationId,
            name: input.name,
            sortOrder: Number(last[0]?.max ?? 0) + 10,
          })
          .returning({ id: schema.memberTypes.id });
        const memberType = (await list(scope)).find((t) => t.id === rows[0]!.id)!;
        return { outcome: "created", memberType };
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: MemberTypeUpdate,
    ): Promise<
      | { outcome: "updated"; memberType: MemberTypeRecord }
      | { outcome: "not_found" }
      | { outcome: "name_taken" }
    > {
      const values: Partial<typeof schema.memberTypes.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.status !== undefined) values.status = patch.status;
      try {
        if (Object.keys(values).length > 0) {
          const updated = await db()
            .update(schema.memberTypes)
            .set(values)
            .where(
              and(
                eq(schema.memberTypes.organizationId, scope.organizationId),
                eq(schema.memberTypes.id, id),
              ),
            )
            .returning({ id: schema.memberTypes.id });
          if (!updated[0]) return { outcome: "not_found" };
        }
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "name_taken" };
        throw error;
      }
      const memberType = (await list(scope)).find((t) => t.id === id);
      return memberType ? { outcome: "updated", memberType } : { outcome: "not_found" };
    },
  };
}

export function clubMembersRepo(db: () => Database) {
  const people = peopleRepo(db);

  const selection = {
    id: schema.clubMembers.id,
    memberNumber: schema.clubMembers.memberNumber,
    status: schema.clubMembers.status,
    joinedOn: schema.clubMembers.joinedOn,
    leftOn: schema.clubMembers.leftOn,
    memberTypeId: schema.memberTypes.id,
    memberTypeName: schema.memberTypes.name,
    person: personSelection,
  };
  const query = () =>
    db()
      .select(selection)
      .from(schema.clubMembers)
      .innerJoin(schema.people, eq(schema.people.id, schema.clubMembers.personId))
      .leftJoin(schema.memberTypes, eq(schema.memberTypes.id, schema.clubMembers.memberTypeId));
  type Row = Awaited<ReturnType<ReturnType<typeof query>["execute"]>>[number];

  /** Papeles de cada persona: deportista, familia de quién y si trabaja en el club. */
  async function rolesFor(
    scope: OrgScope,
    persons: { id: string; userId: string | null }[],
  ): Promise<Map<string, ClubMemberRecord["roles"]>> {
    const map = new Map<string, ClubMemberRecord["roles"]>();
    if (persons.length === 0) return map;
    const personIds = persons.map((p) => p.id);
    const userIds = persons.map((p) => p.userId).filter((u): u is string => u !== null);
    const [players, guardians, staff] = await Promise.all([
      db()
        .select({ personId: schema.players.personId, id: schema.players.id })
        .from(schema.players)
        .where(
          and(
            eq(schema.players.organizationId, scope.organizationId),
            inArray(schema.players.personId, personIds),
          ),
        ),
      db()
        .select({
          guardianPersonId: schema.playerGuardians.guardianPersonId,
          userId: schema.playerGuardians.userId,
          playerId: schema.playerGuardians.playerId,
          firstName: schema.people.firstName,
          lastName: schema.people.lastName,
        })
        .from(schema.playerGuardians)
        .innerJoin(schema.players, eq(schema.players.id, schema.playerGuardians.playerId))
        .innerJoin(schema.people, eq(schema.people.id, schema.players.personId))
        .where(
          and(
            eq(schema.playerGuardians.organizationId, scope.organizationId),
            or(
              inArray(schema.playerGuardians.guardianPersonId, personIds),
              userIds.length > 0 ? inArray(schema.playerGuardians.userId, userIds) : sql`false`,
            ),
          ),
        ),
      userIds.length > 0
        ? db()
            .select({ userId: schema.memberships.userId })
            .from(schema.memberships)
            .where(
              and(
                eq(schema.memberships.organizationId, scope.organizationId),
                inArray(schema.memberships.userId, userIds),
                eq(schema.memberships.status, "active"),
                inArray(schema.memberships.roleCode, ["org_admin", "staff", "coach"]),
              ),
            )
        : Promise.resolve([] as { userId: string }[]),
    ]);
    const staffUsers = new Set(staff.map((s) => s.userId));
    const playerBy = new Map(players.map((p) => [p.personId, p.id]));
    for (const person of persons) {
      const guardianOf = guardians
        .filter(
          (g) =>
            g.guardianPersonId === person.id ||
            (person.userId !== null && g.userId === person.userId),
        )
        .map((g) => ({ playerId: g.playerId, name: `${g.firstName} ${g.lastName}`.trim() }));
      const seen = new Set<string>();
      map.set(person.id, {
        player: playerBy.has(person.id) ? { id: playerBy.get(person.id)! } : null,
        guardianOf: guardianOf.filter((g) => !seen.has(g.playerId) && seen.add(g.playerId)),
        staff: person.userId !== null && staffUsers.has(person.userId),
      });
    }
    return map;
  }

  async function toRecords(scope: OrgScope, rows: Row[]): Promise<ClubMemberRecord[]> {
    const roles = await rolesFor(
      scope,
      rows.map((r) => ({ id: r.person.id, userId: r.person.userId })),
    );
    return rows.map((row) => ({
      id: row.id,
      memberNumber: row.memberNumber,
      status: row.status as ClubMemberStatus,
      joinedOn: row.joinedOn,
      leftOn: row.leftOn,
      memberType:
        row.memberTypeId && row.memberTypeName !== null
          ? { id: row.memberTypeId, name: row.memberTypeName }
          : null,
      person: toPersonRow(row.person),
      roles: roles.get(row.person.id) ?? { player: null, guardianOf: [], staff: false },
    }));
  }

  async function byId(scope: OrgScope, id: string): Promise<ClubMemberRecord | null> {
    const rows = await query().where(
      and(
        eq(schema.clubMembers.organizationId, scope.organizationId),
        eq(schema.clubMembers.id, id),
      ),
    );
    return (await toRecords(scope, rows))[0] ?? null;
  }

  async function byPerson(scope: OrgScope, personId: string): Promise<ClubMemberRecord | null> {
    const rows = await query().where(
      and(
        eq(schema.clubMembers.organizationId, scope.organizationId),
        eq(schema.clubMembers.personId, personId),
      ),
    );
    return (await toRecords(scope, rows))[0] ?? null;
  }

  return {
    byId,
    byPerson,

    async list(
      scope: OrgScope,
      filter: {
        status?: ClubMemberStatus | undefined;
        memberTypeId?: string | undefined;
        query?: string | undefined;
      } = {},
    ): Promise<ClubMemberRecord[]> {
      const conditions = [eq(schema.clubMembers.organizationId, scope.organizationId)];
      if (filter.status) conditions.push(eq(schema.clubMembers.status, filter.status));
      if (filter.memberTypeId)
        conditions.push(eq(schema.clubMembers.memberTypeId, filter.memberTypeId));
      const q = filter.query?.trim();
      if (q) {
        const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        conditions.push(
          or(
            ilike(schema.people.firstName, pattern),
            ilike(schema.people.lastName, pattern),
            ilike(sql`${schema.people.firstName} || ' ' || ${schema.people.lastName}`, pattern),
            ilike(schema.people.email, pattern),
            /^\d+$/.test(q) ? eq(schema.clubMembers.memberNumber, Number(q)) : sql`false`,
          )!,
        );
      }
      const rows = await query()
        .where(and(...conditions))
        .orderBy(asc(schema.clubMembers.memberNumber))
        .limit(1000);
      return toRecords(scope, rows);
    },

    /** Siguiente número de socio libre. */
    async nextNumber(scope: OrgScope): Promise<number> {
      const rows = await db()
        .select({ max: sql<number>`coalesce(max(${schema.clubMembers.memberNumber}), 0)` })
        .from(schema.clubMembers)
        .where(eq(schema.clubMembers.organizationId, scope.organizationId));
      return Number(rows[0]?.max ?? 0) + 1;
    },

    /** Alta de socio: con una persona existente o creando una nueva. */
    async create(
      scope: OrgScope,
      input: ClubMemberCreate,
    ): Promise<
      | { outcome: "created"; member: ClubMemberRecord }
      | { outcome: "unknown_person" }
      | { outcome: "already_member" }
      | { outcome: "number_taken" }
      | { outcome: "unknown_member_type" }
    > {
      let personId = input.personId ?? null;
      if (personId) {
        const person = await people.byId(scope, personId);
        if (!person) return { outcome: "unknown_person" };
      }
      if (input.memberTypeId) {
        const type = await db()
          .select({ id: schema.memberTypes.id })
          .from(schema.memberTypes)
          .where(
            and(
              eq(schema.memberTypes.organizationId, scope.organizationId),
              eq(schema.memberTypes.id, input.memberTypeId),
            ),
          )
          .limit(1);
        if (!type[0]) return { outcome: "unknown_member_type" };
      }
      if (!personId && input.person) personId = (await people.create(scope, input.person)).id;
      if (!personId) return { outcome: "unknown_person" };
      const memberNumber = input.memberNumber ?? (await this.nextNumber(scope));
      try {
        const rows = await db()
          .insert(schema.clubMembers)
          .values({
            organizationId: scope.organizationId,
            personId,
            memberNumber,
            memberTypeId: input.memberTypeId ?? null,
            ...(input.joinedOn ? { joinedOn: input.joinedOn } : {}),
            status: input.status ?? "active",
          })
          .returning({ id: schema.clubMembers.id });
        return { outcome: "created", member: (await byId(scope, rows[0]!.id))! };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await byPerson(scope, personId);
        return existing ? { outcome: "already_member" } : { outcome: "number_taken" };
      }
    },

    async update(
      scope: OrgScope,
      id: string,
      patch: ClubMemberUpdate,
    ): Promise<
      | { outcome: "updated"; member: ClubMemberRecord }
      | { outcome: "not_found" }
      | { outcome: "number_taken" }
      | { outcome: "unknown_member_type" }
    > {
      const values: Partial<typeof schema.clubMembers.$inferInsert> = {};
      if (patch.memberTypeId !== undefined) {
        if (patch.memberTypeId) {
          const type = await db()
            .select({ id: schema.memberTypes.id })
            .from(schema.memberTypes)
            .where(
              and(
                eq(schema.memberTypes.organizationId, scope.organizationId),
                eq(schema.memberTypes.id, patch.memberTypeId),
              ),
            )
            .limit(1);
          if (!type[0]) return { outcome: "unknown_member_type" };
        }
        values.memberTypeId = patch.memberTypeId;
      }
      if (patch.memberNumber !== undefined) values.memberNumber = patch.memberNumber;
      if (patch.joinedOn !== undefined) values.joinedOn = patch.joinedOn;
      if (patch.leftOn !== undefined) values.leftOn = patch.leftOn;
      if (patch.status !== undefined) {
        values.status = patch.status;
        if (patch.status === "left" && patch.leftOn === undefined)
          values.leftOn = new Date().toISOString().slice(0, 10);
        if (patch.status === "active") values.leftOn = null;
      }
      try {
        if (Object.keys(values).length > 0) {
          const updated = await db()
            .update(schema.clubMembers)
            .set(values)
            .where(
              and(
                eq(schema.clubMembers.organizationId, scope.organizationId),
                eq(schema.clubMembers.id, id),
              ),
            )
            .returning({ id: schema.clubMembers.id });
          if (!updated[0]) return { outcome: "not_found" };
        }
      } catch (error) {
        if (isUniqueViolation(error)) return { outcome: "number_taken" };
        throw error;
      }
      const member = await byId(scope, id);
      return member ? { outcome: "updated", member } : { outcome: "not_found" };
    },

    /** Cifras del inicio: socios activos y altas del mes en curso. */
    async counts(scope: OrgScope): Promise<{ active: number; joinedThisMonth: number }> {
      const rows = await db()
        .select({
          active: count(),
          joinedThisMonth: sql<number>`count(*) filter (where ${schema.clubMembers.joinedOn} >= date_trunc('month', current_date))`,
        })
        .from(schema.clubMembers)
        .where(
          and(
            eq(schema.clubMembers.organizationId, scope.organizationId),
            eq(schema.clubMembers.status, "active"),
          ),
        );
      return {
        active: rows[0]?.active ?? 0,
        joinedThisMonth: Number(rows[0]?.joinedThisMonth ?? 0),
      };
    },

    /** Número de socio de cada persona, si lo tiene (para listas). */
    async numbersFor(scope: OrgScope, personIds: string[]): Promise<Map<string, number>> {
      if (personIds.length === 0) return new Map();
      const rows = await db()
        .select({
          personId: schema.clubMembers.personId,
          memberNumber: schema.clubMembers.memberNumber,
        })
        .from(schema.clubMembers)
        .where(
          and(
            eq(schema.clubMembers.organizationId, scope.organizationId),
            inArray(schema.clubMembers.personId, personIds),
            isNotNull(schema.clubMembers.memberNumber),
          ),
        );
      return new Map(rows.map((r) => [r.personId, r.memberNumber]));
    },

    /** Personal del club: cuentas con rol de administración, personal o entrenador (para el inicio). */
    async staffCount(scope: OrgScope): Promise<number> {
      const rows = await db()
        .select({ total: sql<number>`count(distinct ${schema.memberships.userId})` })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, scope.organizationId),
            eq(schema.memberships.status, "active"),
            inArray(schema.memberships.roleCode, ["org_admin", "staff", "coach"]),
          ),
        );
      return Number(rows[0]?.total ?? 0);
    },

    /** Últimas altas de socio (para el inicio). */
    async recent(scope: OrgScope, limit = 5): Promise<ClubMemberRecord[]> {
      const rows = await query()
        .where(eq(schema.clubMembers.organizationId, scope.organizationId))
        .orderBy(desc(schema.clubMembers.joinedOn), desc(schema.clubMembers.createdAt))
        .limit(limit);
      return toRecords(scope, rows);
    },
  };
}
