import { NetlifyDB } from "@netlify/database-dev";
import { LOCALES, ROLE_CODES } from "@sportsmanager/shared";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../../../netlify/database/migrations", import.meta.url).pathname;

/** Ejecuta una consulta y devuelve el código de error de Postgres, o null si no falla. */
async function errorCode(
  client: Client,
  text: string,
  values: unknown[] = [],
): Promise<string | null> {
  try {
    await client.query(text, values);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";

describe("esquema del Bloque 2 (Postgres embebido con todas las migraciones)", () => {
  let local: NetlifyDB;
  let client: Client;
  let sportId: string;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    local = new NetlifyDB();
    const connectionString = await local.start();
    await local.applyMigrations(MIGRATIONS);
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await local?.stop();
  });

  it("siembra el deporte fútbol sala con nombre en los tres idiomas", async () => {
    const { rows } = await client.query<{ id: string; name: Record<string, string> }>(
      "select id, name from sports where code = 'futsal'",
    );
    expect(rows).toHaveLength(1);
    sportId = rows[0]!.id;
    for (const locale of LOCALES) expect(rows[0]!.name[locale], locale).toBeTruthy();
  });

  it("siembra exactamente los roles que conoce packages/shared", async () => {
    const { rows } = await client.query<{ code: string }>(
      "select code from roles order by sort_order",
    );
    expect(rows.map((r) => r.code).sort()).toEqual([...ROLE_CODES].sort());
  });

  it("crea una organización válida y rechaza slug, idioma y colores inválidos", async () => {
    const insert =
      "insert into organizations (slug, name, default_locale, default_sport_id, brand_primary_color, brand_secondary_color) values ($1, $2, $3, $4, $5, $6) returning id";
    const { rows } = await client.query<{ id: string }>(insert, [
      "club-uno",
      "Club Uno",
      "ca",
      sportId,
      "#d71920",
      "#e8b52a",
    ]);
    orgId = rows[0]!.id;
    expect(orgId).toMatch(/^[0-9a-f-]{36}$/);

    expect(
      await errorCode(client, insert, ["club-uno", "Otro", "es", sportId, "#000000", "#ffffff"]),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, insert, ["Club-Dos", "Otro", "es", sportId, "#000000", "#ffffff"]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, insert, ["-club", "Otro", "es", sportId, "#000000", "#ffffff"]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, insert, ["club-dos", "Otro", "de", sportId, "#000000", "#ffffff"]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, insert, ["club-dos", "Otro", "es", sportId, "rojo", "#ffffff"]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, insert, ["club-dos", "Otro", "es", sportId, "#D71920", "#ffffff"]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, "update organizations set status = 'deleted' where id = $1", [orgId]),
    ).toBe(CHECK_VIOLATION);
  });

  it("no permite borrar un deporte en uso", async () => {
    expect(await errorCode(client, "delete from sports where id = $1", [sportId])).toBe(
      FK_VIOLATION,
    );
  });

  it("crea usuarios con UUID de base y exige email en minúsculas e idioma conocido", async () => {
    const { rows } = await client.query<{ id: string }>(
      "insert into users (name, email) values ('Ana', 'ana@club.test') returning id",
    );
    userId = rows[0]!.id;
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      await errorCode(client, "insert into users (name, email) values ('Ana', 'Ana@club.test')"),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, "insert into users (name, email) values ('Ana', 'ana@club.test')"),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(
        client,
        "insert into users (name, email, locale) values ('Bea', 'bea@club.test', 'de')",
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it("permite varios roles por usuario y club, pero no el mismo rol dos veces (ADR 0014)", async () => {
    const insert =
      "insert into memberships (user_id, organization_id, role_code) values ($1, $2, $3)";
    expect(await errorCode(client, insert, [userId, orgId, "coach"])).toBeNull();
    expect(await errorCode(client, insert, [userId, orgId, "guardian"])).toBeNull();
    expect(await errorCode(client, insert, [userId, orgId, "coach"])).toBe(UNIQUE_VIOLATION);
    expect(await errorCode(client, insert, [userId, orgId, "superadmin"])).toBe(FK_VIOLATION);
    expect(
      await errorCode(client, "update memberships set status = 'banned' where user_id = $1", [
        userId,
      ]),
    ).toBe(CHECK_VIOLATION);
  });

  it("admite una sola invitación pendiente por club y email", async () => {
    const insert =
      "insert into invitations (organization_id, email, role_code, token_hash, expires_at, invited_by) values ($1, $2, $3, $4, now() + interval '7 days', $5) returning id";
    const first = await client.query<{ id: string }>(insert, [
      orgId,
      "nueva@club.test",
      "guardian",
      "hash-1",
      userId,
    ]);
    expect(
      await errorCode(client, insert, [orgId, "nueva@club.test", "coach", "hash-2", userId]),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, insert, [orgId, "Nueva@club.test", "coach", "hash-3", userId]),
    ).toBe(CHECK_VIOLATION);
    await client.query(
      "update invitations set status = 'accepted', accepted_by = $2, accepted_at = now() where id = $1",
      [first.rows[0]!.id, userId],
    );
    expect(
      await errorCode(client, insert, [orgId, "nueva@club.test", "coach", "hash-4", userId]),
    ).toBeNull();
    expect(
      await errorCode(client, insert, [orgId, "otra@club.test", "coach", "hash-4", userId]),
    ).toBe(UNIQUE_VIOLATION);
  });

  it("platform_admins solo admite usuarios existentes", async () => {
    expect(
      await errorCode(client, "insert into platform_admins (user_id) values ($1)", [userId]),
    ).toBeNull();
    expect(
      await errorCode(
        client,
        "insert into platform_admins (user_id) values ('00000000-0000-0000-0000-000000000000')",
      ),
    ).toBe(FK_VIOLATION);
  });

  it("estructura del club (ADR 0028): una sola temporada actual, equipos únicos por temporada y sección, plantilla sin repetidos", async () => {
    const season =
      "insert into seasons (organization_id, name, starts_on, ends_on, is_current) values ($1, $2, $3, $4, $5) returning id";
    const { rows: s1 } = await client.query<{ id: string }>(season, [
      orgId,
      "2026-27",
      "2026-09-01",
      "2027-06-30",
      true,
    ]);
    expect(
      await errorCode(client, season, [orgId, "2027-28", "2027-09-01", "2028-06-30", true]),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, season, [orgId, "2026-27", "2027-09-01", "2028-06-30", false]),
    ).toBe(UNIQUE_VIOLATION);
    expect(await errorCode(client, season, [orgId, "mal", "2027-09-01", "2027-01-01", false])).toBe(
      CHECK_VIOLATION,
    );

    const { rows: sec } = await client.query<{ id: string }>(
      "insert into sections (organization_id, name) values ($1, 'Fútbol sala') returning id",
      [orgId],
    );
    expect(
      await errorCode(
        client,
        "insert into sections (organization_id, name) values ($1, 'Fútbol sala')",
        [orgId],
      ),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, "update sections set status = 'deleted' where id = $1", [sec[0]!.id]),
    ).toBe(CHECK_VIOLATION);

    const team =
      "insert into teams (organization_id, section_id, season_id, name, category) values ($1, $2, $3, $4, $5) returning id";
    const { rows: t1 } = await client.query<{ id: string }>(team, [
      orgId,
      sec[0]!.id,
      s1[0]!.id,
      "Alevín A",
      "Alevín",
    ]);
    expect(await errorCode(client, team, [orgId, sec[0]!.id, s1[0]!.id, "Alevín A", null])).toBe(
      UNIQUE_VIOLATION,
    );

    const { rows: p1 } = await client.query<{ id: string }>(
      "insert into players (organization_id, first_name, last_name, birth_date) values ($1, 'Clara', 'Martí', '2015-02-03') returning id",
      [orgId],
    );
    const roster =
      "insert into team_players (organization_id, team_id, player_id, shirt_number) values ($1, $2, $3, $4)";
    expect(await errorCode(client, roster, [orgId, t1[0]!.id, p1[0]!.id, 1])).toBeNull();
    expect(await errorCode(client, roster, [orgId, t1[0]!.id, p1[0]!.id, 2])).toBe(
      UNIQUE_VIOLATION,
    );
    expect(
      await errorCode(client, "update team_players set shirt_number = -1 where player_id = $1", [
        p1[0]!.id,
      ]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, "update players set status = 'gone' where id = $1", [p1[0]!.id]),
    ).toBe(CHECK_VIOLATION);

    const guardian =
      "insert into player_guardians (organization_id, player_id, user_id, relationship) values ($1, $2, $3, $4)";
    expect(await errorCode(client, guardian, [orgId, p1[0]!.id, userId, "mother"])).toBeNull();
    expect(await errorCode(client, guardian, [orgId, p1[0]!.id, userId, "father"])).toBe(
      UNIQUE_VIOLATION,
    );
    expect(
      await errorCode(
        client,
        "update player_guardians set relationship = 'cousin' where player_id = $1",
        [p1[0]!.id],
      ),
    ).toBe(CHECK_VIOLATION);

    // Invitación de familia ligada al jugador: borrar el jugador la deja sin jugador, no la borra.
    await client.query(
      "insert into invitations (organization_id, email, role_code, token_hash, expires_at, player_id, relationship) values ($1, 'mama@club.test', 'guardian', 'hash-fam', now() + interval '7 days', $2, 'mother')",
      [orgId, p1[0]!.id],
    );
    expect(
      await errorCode(
        client,
        "update invitations set relationship = 'cousin' where token_hash = 'hash-fam'",
      ),
    ).toBe(CHECK_VIOLATION);
    await client.query("delete from players where id = $1", [p1[0]!.id]);
    expect(
      (await client.query("select 1 from team_players where player_id = $1", [p1[0]!.id])).rowCount,
    ).toBe(0);
    expect(
      (await client.query("select 1 from player_guardians where player_id = $1", [p1[0]!.id]))
        .rowCount,
    ).toBe(0);
    const { rows: inv } = await client.query<{ player_id: string | null }>(
      "select player_id from invitations where token_hash = 'hash-fam'",
    );
    expect(inv[0]!.player_id).toBeNull();

    // Una sección o temporada con equipos no se borra.
    expect(await errorCode(client, "delete from sections where id = $1", [sec[0]!.id])).toBe(
      FK_VIOLATION,
    );
    expect(await errorCode(client, "delete from seasons where id = $1", [s1[0]!.id])).toBe(
      FK_VIOLATION,
    );
    expect(
      await errorCode(client, "update organizations set voice = 'gritona' where id = $1", [orgId]),
    ).toBe(CHECK_VIOLATION);
  });

  it("el club demo llega con temporada, sección, equipos, plantilla y dos cuentas de prueba", async () => {
    const { rows } = await client.query<{
      teams: string;
      players: string;
      staff: string;
      guardians: string;
    }>(
      `select
         (select count(*) from teams t join organizations o on o.id = t.organization_id where o.slug = 'demo') as teams,
         (select count(*) from team_players tp join organizations o on o.id = tp.organization_id where o.slug = 'demo') as players,
         (select count(*) from team_staff ts join users u on u.id = ts.user_id where u.email = 'entrenador@demo.test') as staff,
         (select count(*) from player_guardians pg join users u on u.id = pg.user_id where u.email = 'familia@demo.test') as guardians`,
    );
    expect(Number(rows[0]!.teams)).toBe(4);
    expect(Number(rows[0]!.players)).toBe(36);
    expect(Number(rows[0]!.staff)).toBe(1);
    expect(Number(rows[0]!.guardians)).toBe(2);
    const { rows: seasons } = await client.query<{ is_current: boolean }>(
      "select s.is_current from seasons s join organizations o on o.id = s.organization_id where o.slug = 'demo'",
    );
    expect(seasons).toEqual([{ is_current: true }]);
  });

  it("borrar un club arrastra pertenencias e invitaciones; borrar un usuario deja en nulo quién invitó", async () => {
    const { rows } = await client.query<{ id: string }>(
      "insert into organizations (slug, name, default_locale, default_sport_id, brand_primary_color, brand_secondary_color) values ('club-tmp', 'Tmp', 'es', $1, '#111111', '#222222') returning id",
      [sportId],
    );
    const tmpOrg = rows[0]!.id;
    await client.query(
      "insert into memberships (user_id, organization_id, role_code) values ($1, $2, 'org_admin')",
      [userId, tmpOrg],
    );
    await client.query(
      "insert into invitations (organization_id, email, role_code, token_hash, expires_at, invited_by) values ($1, 'x@club.test', 'coach', 'hash-tmp', now(), $2)",
      [tmpOrg, userId],
    );
    await client.query("delete from organizations where id = $1", [tmpOrg]);
    expect(
      (await client.query("select 1 from memberships where organization_id = $1", [tmpOrg]))
        .rowCount,
    ).toBe(0);
    expect(
      (await client.query("select 1 from invitations where organization_id = $1", [tmpOrg]))
        .rowCount,
    ).toBe(0);

    const { rows: u } = await client.query<{ id: string }>(
      "insert into users (name, email) values ('Tmp', 'tmp@club.test') returning id",
    );
    await client.query(
      "insert into invitations (organization_id, email, role_code, token_hash, expires_at, invited_by) values ($1, 'y@club.test', 'coach', 'hash-y', now(), $2)",
      [orgId, u[0]!.id],
    );
    await client.query("delete from users where id = $1", [u[0]!.id]);
    const { rows: inv } = await client.query<{ invited_by: string | null }>(
      "select invited_by from invitations where email = 'y@club.test'",
    );
    expect(inv[0]!.invited_by).toBeNull();
  });
});
