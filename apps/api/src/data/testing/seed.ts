import { createDb, schema } from "@sportsmanager/db";
import type { RoleCode, StaffPosition } from "@sportsmanager/shared";
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq } from "drizzle-orm";

/**
 * Datos de prueba para los tests de aislamiento. Vive en la capa de datos porque escribe
 * directamente en la base; los tests solo lo usan para preparar escenarios y comprobar
 * efectos, y después hablan con la API por HTTP.
 */
export function createSeeder(connectionString: string) {
  const handle = createDb({ connectionString, maxConnections: 2 });
  const { db } = handle;

  return {
    async organization(input: {
      slug: string;
      name: string;
      defaultLocale?: "es" | "ca" | "en";
    }): Promise<{ id: string; slug: string }> {
      const sport = await db
        .select({ id: schema.sports.id })
        .from(schema.sports)
        .where(eq(schema.sports.code, "futsal"))
        .limit(1);
      const sportId = sport[0]?.id;
      if (!sportId) throw new Error("Falta la semilla de deportes.");
      const rows = await db
        .insert(schema.organizations)
        .values({
          slug: input.slug,
          name: input.name,
          defaultLocale: input.defaultLocale ?? "es",
          defaultSportId: sportId,
          brandPrimaryColor: "#d71920",
          brandSecondaryColor: "#e8b52a",
        })
        .returning({ id: schema.organizations.id, slug: schema.organizations.slug });
      return rows[0]!;
    },

    async user(input: {
      name: string;
      email: string;
      password: string;
      locale?: "es" | "ca" | "en";
    }): Promise<{ id: string; email: string }> {
      const rows = await db
        .insert(schema.users)
        .values({
          name: input.name,
          email: input.email.toLowerCase(),
          emailVerified: true,
          locale: input.locale ?? null,
        })
        .returning({ id: schema.users.id, email: schema.users.email });
      const user = rows[0]!;
      await db.insert(schema.accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(input.password),
      });
      return user;
    },

    async userByEmail(email: string): Promise<{ id: string; name: string } | null> {
      const rows = await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase()))
        .limit(1);
      return rows[0] ?? null;
    },

    async membership(
      organizationId: string,
      userId: string,
      roleCode: RoleCode,
      position: StaffPosition | null = null,
    ): Promise<void> {
      await db
        .insert(schema.memberships)
        .values({
          organizationId,
          userId,
          roleCode,
          position: roleCode === "staff" ? position : null,
        })
        .onConflictDoNothing();
    },

    async platformAdmin(userId: string): Promise<void> {
      await db.insert(schema.platformAdmins).values({ userId, note: "test" }).onConflictDoNothing();
    },

    async supportGrant(organizationId: string, userId: string, minutes: number): Promise<void> {
      await db.insert(schema.supportAccessGrants).values({
        organizationId,
        userId,
        expiresAt: new Date(Date.now() + minutes * 60_000),
        reason: "test",
      });
    },

    async rolesOf(organizationId: string, userId: string): Promise<string[]> {
      const rows = await db
        .select({ roleCode: schema.memberships.roleCode })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.organizationId, organizationId),
            eq(schema.memberships.userId, userId),
          ),
        );
      return rows.map((r) => r.roleCode).sort();
    },

    /** Último email registrado para un destinatario, con su cuerpo en texto (contiene el enlace). */
    async lastEmailTo(email: string) {
      const rows = await db
        .select({
          template: schema.emailOutbox.template,
          subject: schema.emailOutbox.subject,
          textBody: schema.emailOutbox.textBody,
          htmlBody: schema.emailOutbox.htmlBody,
          locale: schema.emailOutbox.locale,
          status: schema.emailOutbox.status,
          transport: schema.emailOutbox.transport,
          organizationId: schema.emailOutbox.organizationId,
        })
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.toEmail, email.toLowerCase()))
        .orderBy(desc(schema.emailOutbox.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async countEmailsTo(email: string): Promise<number> {
      const rows = await db
        .select({ id: schema.emailOutbox.id })
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.toEmail, email.toLowerCase()));
      return rows.length;
    },

    async invitationStatus(organizationId: string, email: string): Promise<string[]> {
      const rows = await db
        .select({ status: schema.invitations.status })
        .from(schema.invitations)
        .where(
          and(
            eq(schema.invitations.organizationId, organizationId),
            eq(schema.invitations.email, email.toLowerCase()),
          ),
        )
        .orderBy(desc(schema.invitations.createdAt));
      return rows.map((r) => r.status);
    },

    /** Fuerza la caducidad de la invitación pendiente de un email en un club. */
    async expireInvitation(organizationId: string, email: string): Promise<void> {
      await db
        .update(schema.invitations)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(
          and(
            eq(schema.invitations.organizationId, organizationId),
            eq(schema.invitations.email, email.toLowerCase()),
            eq(schema.invitations.status, "pending"),
          ),
        );
    },

    // --- Estructura del club (Bloques 11 y 14), para montar escenarios sin pasar por la API ---

    async season(
      organizationId: string,
      input: { name: string; startsOn: string; endsOn: string; isCurrent?: boolean },
    ): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.seasons)
        .values({
          organizationId,
          name: input.name,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          isCurrent: input.isCurrent ?? true,
        })
        .returning({ id: schema.seasons.id });
      return rows[0]!;
    },

    async section(
      organizationId: string,
      name: string,
      sportCode = "futsal",
      kind: "competition" | "activity" = "competition",
    ): Promise<{ id: string }> {
      const sport = await db
        .select({ id: schema.sports.id })
        .from(schema.sports)
        .where(eq(schema.sports.code, sportCode))
        .limit(1);
      if (!sport[0]) throw new Error(`Falta el deporte ${sportCode} en la semilla.`);
      const rows = await db
        .insert(schema.sections)
        .values({ organizationId, name, sportId: sport[0].id, kind })
        .returning({ id: schema.sections.id });
      return rows[0]!;
    },

    async category(
      organizationId: string,
      sectionId: string,
      name: string,
    ): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.categories)
        .values({ organizationId, sectionId, name })
        .returning({ id: schema.categories.id });
      return rows[0]!;
    },

    async team(
      organizationId: string,
      input: { sectionId: string; categoryId: string; seasonId: string; name: string },
    ): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.teams)
        .values({ organizationId, ...input })
        .returning({ id: schema.teams.id });
      return rows[0]!;
    },

    async person(
      organizationId: string,
      input: { firstName: string; lastName: string; birthDate?: string; userId?: string },
    ): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.people)
        .values({
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate ?? null,
          userId: input.userId ?? null,
        })
        .returning({ id: schema.people.id });
      return rows[0]!;
    },

    async player(organizationId: string, personId: string): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.players)
        .values({ organizationId, personId })
        .returning({ id: schema.players.id });
      return rows[0]!;
    },

    async rosterAdd(
      organizationId: string,
      teamId: string,
      playerId: string,
      shirtNumber: number | null = null,
    ): Promise<void> {
      await db
        .insert(schema.teamPlayers)
        .values({ organizationId, teamId, playerId, shirtNumber })
        .onConflictDoNothing();
    },

    async teamStaff(
      organizationId: string,
      teamId: string,
      userId: string,
      roleInTeam = "head_coach",
    ): Promise<void> {
      await db
        .insert(schema.teamStaff)
        .values({ organizationId, teamId, userId, roleInTeam })
        .onConflictDoNothing();
    },

    async guardian(
      organizationId: string,
      playerId: string,
      userId: string,
      relationship = "mother",
    ): Promise<void> {
      await db
        .insert(schema.playerGuardians)
        .values({ organizationId, playerId, userId, relationship })
        .onConflictDoNothing();
    },

    // --- Socios (Bloque 14 y 18): tipos de socio y fichas de socio sembradas directas ---

    async memberType(organizationId: string, name: string): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.memberTypes)
        .values({ organizationId, name })
        .onConflictDoNothing()
        .returning({ id: schema.memberTypes.id });
      if (rows[0]) return rows[0];
      const existing = await db
        .select({ id: schema.memberTypes.id })
        .from(schema.memberTypes)
        .where(
          and(
            eq(schema.memberTypes.organizationId, organizationId),
            eq(schema.memberTypes.name, name),
          ),
        )
        .limit(1);
      return existing[0]!;
    },

    async clubMember(
      organizationId: string,
      personId: string,
      input: { memberNumber: number; memberTypeId?: string | null; status?: string },
    ): Promise<{ id: string }> {
      const rows = await db
        .insert(schema.clubMembers)
        .values({
          organizationId,
          personId,
          memberNumber: input.memberNumber,
          memberTypeId: input.memberTypeId ?? null,
          status: input.status ?? "active",
        })
        .returning({ id: schema.clubMembers.id });
      return rows[0]!;
    },

    /** Contacto y documento de una persona, como los rellena el club en su ficha. */
    async personDetails(
      personId: string,
      input: { email?: string | null; nationalId?: string | null; phone?: string | null },
    ): Promise<void> {
      await db.update(schema.people).set(input).where(eq(schema.people.id, personId));
    },

    // --- Cobros y contabilidad (ADR 0042) ---

    async stripeAccount(organizationId: string, accountId: string | null): Promise<void> {
      await db
        .update(schema.organizations)
        .set({ stripeAccountId: accountId })
        .where(eq(schema.organizations.id, organizationId));
    },

    async stripeAccountStatus(organizationId: string): Promise<string | null> {
      const rows = await db
        .select({ status: schema.organizations.stripeAccountStatus })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);
      return rows[0]?.status ?? null;
    },

    /** La clave de contabilidad tal y como queda en la base: para comprobar que va cifrada. */
    async accountingCiphertext(organizationId: string): Promise<string | null> {
      const rows = await db
        .select({ value: schema.accountingConnections.apiKeyCiphertext })
        .from(schema.accountingConnections)
        .where(eq(schema.accountingConnections.organizationId, organizationId))
        .limit(1);
      return rows[0]?.value ?? null;
    },

    async accountingLinkCount(organizationId: string): Promise<number> {
      const rows = await db
        .select({ id: schema.accountingLinks.id })
        .from(schema.accountingLinks)
        .where(eq(schema.accountingLinks.organizationId, organizationId));
      return rows.length;
    },

    async close() {
      await handle.close();
    },
  };
}
