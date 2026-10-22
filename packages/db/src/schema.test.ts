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
const NOT_NULL_VIOLATION = "23502";

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
      "insert into sections (organization_id, name, sport_id) values ($1, 'Fútbol sala', $2) returning id",
      [orgId, sportId],
    );
    expect(
      await errorCode(
        client,
        "insert into sections (organization_id, name, sport_id) values ($1, 'Fútbol sala', $2)",
        [orgId, sportId],
      ),
    ).toBe(UNIQUE_VIOLATION);
    // Una sección siempre tiene deporte y un tipo conocido (Bloque 14).
    expect(
      await errorCode(
        client,
        "insert into sections (organization_id, name) values ($1, 'Sin deporte')",
        [orgId],
      ),
    ).toBe(NOT_NULL_VIOLATION);
    expect(
      await errorCode(client, "update sections set kind = 'otro' where id = $1", [sec[0]!.id]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, "update sections set status = 'deleted' where id = $1", [sec[0]!.id]),
    ).toBe(CHECK_VIOLATION);

    // Categorías (Bloque 14): únicas por sección, género y años conocidos, no se borran con equipos.
    const category =
      "insert into categories (organization_id, section_id, name, gender, birth_year_from, birth_year_to) values ($1, $2, $3, $4, $5, $6) returning id";
    const { rows: cat } = await client.query<{ id: string }>(category, [
      orgId,
      sec[0]!.id,
      "Alevín",
      "mixed",
      2015,
      2016,
    ]);
    expect(await errorCode(client, category, [orgId, sec[0]!.id, "Alevín", null, null, null])).toBe(
      UNIQUE_VIOLATION,
    );
    expect(
      await errorCode(client, category, [orgId, sec[0]!.id, "Rara", "unisex", null, null]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, category, [orgId, sec[0]!.id, "Al revés", null, 2016, 2015]),
    ).toBe(CHECK_VIOLATION);

    const team =
      "insert into teams (organization_id, section_id, category_id, season_id, name) values ($1, $2, $3, $4, $5) returning id";
    const { rows: t1 } = await client.query<{ id: string }>(team, [
      orgId,
      sec[0]!.id,
      cat[0]!.id,
      s1[0]!.id,
      "Alevín A",
    ]);
    expect(
      await errorCode(client, team, [orgId, sec[0]!.id, cat[0]!.id, s1[0]!.id, "Alevín A"]),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, "update teams set capacity = 0 where id = $1", [t1[0]!.id]),
    ).toBe(CHECK_VIOLATION);
    expect(await errorCode(client, "delete from categories where id = $1", [cat[0]!.id])).toBe(
      FK_VIOLATION,
    );

    // Un deportista es una persona del club (Bloque 14): sin persona no hay ficha.
    const { rows: person } = await client.query<{ id: string }>(
      "insert into people (organization_id, first_name, last_name, birth_date) values ($1, 'Clara', 'Martí', '2015-02-03') returning id",
      [orgId],
    );
    expect(
      await errorCode(client, "insert into players (organization_id) values ($1)", [orgId]),
    ).toBe(NOT_NULL_VIOLATION);
    const { rows: p1 } = await client.query<{ id: string }>(
      "insert into players (organization_id, person_id) values ($1, $2) returning id",
      [orgId, person[0]!.id],
    );
    expect(
      await errorCode(client, "insert into players (organization_id, person_id) values ($1, $2)", [
        orgId,
        person[0]!.id,
      ]),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, "update people set email = 'Clara@club.test' where id = $1", [
        person[0]!.id,
      ]),
    ).toBe(CHECK_VIOLATION);
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
    await client.query("delete from people where id = $1", [person[0]!.id]);
    expect((await client.query("select 1 from players where id = $1", [p1[0]!.id])).rowCount).toBe(
      0,
    );
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

  it("ficha ampliada del jugador (ADR 0029): pie y altura válidos, un objetivo y un PDI por jugador, indicadores por dimensión y registros con tipo conocido", async () => {
    const { rows: marc } = await client.query<{ id: string }>(
      "insert into people (organization_id, first_name, last_name) values ($1, 'Marc', 'Martí') returning id",
      [orgId],
    );
    const { rows: p } = await client.query<{ id: string }>(
      "insert into players (organization_id, person_id, dominant_foot, height_cm) values ($1, $2, 'right', 142) returning id",
      [orgId, marc[0]!.id],
    );
    const playerId = p[0]!.id;
    expect(
      await errorCode(client, "update players set dominant_foot = 'head' where id = $1", [
        playerId,
      ]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(client, "update players set height_cm = 300 where id = $1", [playerId]),
    ).toBe(CHECK_VIOLATION);

    const { rows: owner } = await client.query<{ id: string }>(
      "insert into users (name, email) values ('Resp', 'resp@club.test') returning id",
    );
    const objective =
      "insert into player_objectives (organization_id, player_id, title, progress, owner_user_id) values ($1, $2, $3, $4, $5)";
    expect(
      await errorCode(client, objective, [orgId, playerId, "Conducción", 45, owner[0]!.id]),
    ).toBeNull();
    expect(await errorCode(client, objective, [orgId, playerId, "Otro", 10, null])).toBe(
      UNIQUE_VIOLATION,
    );
    expect(
      await errorCode(client, "update player_objectives set progress = 101 where player_id = $1", [
        playerId,
      ]),
    ).toBe(CHECK_VIOLATION);

    const indicator =
      "insert into player_indicators (organization_id, player_id, dimension, score) values ($1, $2, $3, $4)";
    expect(await errorCode(client, indicator, [orgId, playerId, "sport", 72])).toBeNull();
    expect(await errorCode(client, indicator, [orgId, playerId, "sport", 80])).toBe(
      UNIQUE_VIOLATION,
    );
    expect(await errorCode(client, indicator, [orgId, playerId, "speed", 80])).toBe(
      CHECK_VIOLATION,
    );
    expect(await errorCode(client, indicator, [orgId, playerId, "body", 120])).toBe(
      CHECK_VIOLATION,
    );

    const plan =
      "insert into player_development_plans (organization_id, player_id, technical, status) values ($1, $2, 'Conducción', $3)";
    expect(await errorCode(client, plan, [orgId, playerId, "draft"])).toBeNull();
    expect(await errorCode(client, plan, [orgId, playerId, "active"])).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(
        client,
        "update player_development_plans set status = 'done' where player_id = $1",
        [playerId],
      ),
    ).toBe(CHECK_VIOLATION);

    const event =
      "insert into player_events (organization_id, player_id, kind, happened_on, details) values ($1, $2, $3, current_date, '{}')";
    expect(await errorCode(client, event, [orgId, playerId, "note"])).toBeNull();
    expect(await errorCode(client, event, [orgId, playerId, "party"])).toBe(CHECK_VIOLATION);

    // Borrar al responsable deja el objetivo sin responsable; borrar al jugador arrastra todo.
    await client.query("delete from users where id = $1", [owner[0]!.id]);
    const { rows: orphan } = await client.query<{ owner_user_id: string | null }>(
      "select owner_user_id from player_objectives where player_id = $1",
      [playerId],
    );
    expect(orphan[0]!.owner_user_id).toBeNull();
    await client.query("delete from players where id = $1", [playerId]);
    for (const table of [
      "player_objectives",
      "player_indicators",
      "player_development_plans",
      "player_events",
    ]) {
      expect(
        (await client.query(`select 1 from ${table} where player_id = $1`, [playerId])).rowCount,
        table,
      ).toBe(0);
    }
  });

  it("alcance por rol (ADR 0033): una regla por perfil o por persona, nunca las dos, y solo áreas conocidas", async () => {
    const rule =
      "insert into access_rules (organization_id, profile, user_id, area, effect) values ($1, $2, $3, $4, $5)";
    expect(
      await errorCode(client, rule, [orgId, "coach", null, "club_members", "allow"]),
    ).toBeNull();
    expect(await errorCode(client, rule, [orgId, "coach", null, "club_members", "deny"])).toBe(
      UNIQUE_VIOLATION,
    );
    expect(await errorCode(client, rule, [orgId, null, userId, "agenda", "deny"])).toBeNull();
    expect(await errorCode(client, rule, [orgId, "coach", userId, "fees", "deny"])).toBe(
      CHECK_VIOLATION,
    );
    expect(await errorCode(client, rule, [orgId, null, null, "fees", "deny"])).toBe(
      CHECK_VIOLATION,
    );
    expect(await errorCode(client, rule, [orgId, "director", null, "tienda", "deny"])).toBe(
      CHECK_VIOLATION,
    );
    expect(await errorCode(client, rule, [orgId, "portero", null, "fees", "deny"])).toBe(
      CHECK_VIOLATION,
    );
    expect(await errorCode(client, rule, [orgId, "director", null, "fees", "maybe"])).toBe(
      CHECK_VIOLATION,
    );

    const { rows: section } = await client.query<{ id: string }>(
      "select id from sections where organization_id = $1 limit 1",
      [orgId],
    );
    const sectionStaff =
      "insert into section_staff (organization_id, section_id, user_id) values ($1, $2, $3)";
    expect(await errorCode(client, sectionStaff, [orgId, section[0]!.id, userId])).toBeNull();
    expect(await errorCode(client, sectionStaff, [orgId, section[0]!.id, userId])).toBe(
      UNIQUE_VIOLATION,
    );
    const { rows: person } = await client.query<{ id: string }>(
      "insert into people (organization_id, first_name, last_name) values ($1, 'Pau', 'Vila') returning id",
      [orgId],
    );
    const { rows: player } = await client.query<{ id: string }>(
      "insert into players (organization_id, person_id) values ($1, $2) returning id",
      [orgId, person[0]!.id],
    );
    const playerStaff =
      "insert into player_staff (organization_id, player_id, user_id) values ($1, $2, $3)";
    expect(await errorCode(client, playerStaff, [orgId, player[0]!.id, userId])).toBeNull();
    expect(await errorCode(client, playerStaff, [orgId, player[0]!.id, userId])).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it("el club demo trae a la dirección con sus secciones y a la fisio con sus deportistas (ADR 0033)", async () => {
    const { rows } = await client.query<{ sections: string; attended: string }>(
      `select
         (select count(*) from section_staff ss join users u on u.id = ss.user_id where u.email = 'director@demo.test') as sections,
         (select count(*) from player_staff ps join users u on u.id = ps.user_id where u.email = 'fisio@demo.test') as attended`,
    );
    expect(Number(rows[0]!.sections)).toBeGreaterThanOrEqual(4);
    expect(Number(rows[0]!.attended)).toBe(2);
  });

  it("el club demo llega con temporada, secciones, equipos, plantilla y cuentas de prueba", async () => {
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
    // Doce equipos y 95 jugadores: el Sénior A de fútbol sala llega con el entrenamiento (ADR 0039).
    expect(Number(rows[0]!.teams)).toBe(12);
    expect(Number(rows[0]!.players)).toBe(95);
    expect(Number(rows[0]!.staff)).toBe(1);
    expect(Number(rows[0]!.guardians)).toBe(2);
    const { rows: seasons } = await client.query<{ is_current: boolean }>(
      "select s.is_current from seasons s join organizations o on o.id = s.organization_id where o.slug = 'demo'",
    );
    expect(seasons).toEqual([{ is_current: true }]);
  });

  it("el club demo trae la ficha ampliada de Clara Martí (ADR 0029)", async () => {
    const { rows } = await client.query<{
      height_cm: number | null;
      dominant_foot: string | null;
      objectives: string;
      indicators: string;
      plans: string;
      events: string;
    }>(
      `select p.height_cm, p.dominant_foot,
         (select count(*) from player_objectives x where x.player_id = p.id) as objectives,
         (select count(*) from player_indicators x where x.player_id = p.id) as indicators,
         (select count(*) from player_development_plans x where x.player_id = p.id) as plans,
         (select count(*) from player_events x where x.player_id = p.id) as events
       from players p join people x on x.id = p.person_id join organizations o on o.id = p.organization_id
       where o.slug = 'demo' and x.first_name = 'Clara' and x.last_name = 'Martí'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ height_cm: 142, dominant_foot: "right" });
    expect(Number(rows[0]!.objectives)).toBe(1);
    expect(Number(rows[0]!.indicators)).toBe(4);
    expect(Number(rows[0]!.plans)).toBe(1);
    expect(Number(rows[0]!.events)).toBe(3);
  });

  it("el club completo (ADR 0031): el demo migra jugadores a personas y trae socios, instalaciones, agenda y cuotas", async () => {
    const { rows } = await client.query<Record<string, string>>(
      `select
         (select count(*) from players p join organizations o on o.id = p.organization_id where o.slug = 'demo' and p.person_id is null) as orphans,
         (select count(*) from sections s join organizations o on o.id = s.organization_id where o.slug = 'demo') as sections,
         (select count(*) from categories c join organizations o on o.id = c.organization_id where o.slug = 'demo') as categories,
         (select count(*) from club_members m join organizations o on o.id = m.organization_id where o.slug = 'demo') as members,
         (select count(*) from facilities f join organizations o on o.id = f.organization_id where o.slug = 'demo') as facilities,
         (select count(*) from events e join organizations o on o.id = e.organization_id where o.slug = 'demo' and e.kind = 'match') as matches,
         (select count(*) from fee_charges c join organizations o on o.id = c.organization_id where o.slug = 'demo' and c.status = 'paid') as paid,
         (select count(*) from people x join organizations o on o.id = x.organization_id join users u on u.id = x.user_id where o.slug = 'demo' and u.email = 'familia@demo.test') as family_person`,
    );
    expect(Number(rows[0]!.orphans)).toBe(0);
    expect(Number(rows[0]!.sections)).toBe(4);
    expect(Number(rows[0]!.categories)).toBe(13);
    expect(Number(rows[0]!.members)).toBeGreaterThan(40);
    expect(Number(rows[0]!.facilities)).toBe(4);
    expect(Number(rows[0]!.matches)).toBe(14);
    expect(Number(rows[0]!.paid)).toBeGreaterThan(0);
    expect(Number(rows[0]!.family_person)).toBe(1);

    // Socios: número único por club, estado conocido; cargos y pagos con importes positivos.
    const { rows: member } = await client.query<{ organization_id: string; person_id: string }>(
      "select m.organization_id, m.person_id from club_members m limit 1",
    );
    expect(
      await errorCode(
        client,
        "insert into club_members (organization_id, person_id, member_number) values ($1, $2, 1)",
        [member[0]!.organization_id, member[0]!.person_id],
      ),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, "update club_members set status = 'expulsado' where person_id = $1", [
        member[0]!.person_id,
      ]),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(
        client,
        "insert into fee_charges (organization_id, person_id, concept, amount_cents, due_on) values ($1, $2, 'Cero', 0, current_date)",
        [member[0]!.organization_id, member[0]!.person_id],
      ),
    ).toBe(CHECK_VIOLATION);

    // Agenda: fin después de inicio, tipo conocido, día de la semana ISO en horarios y franjas.
    const { rows: facility } = await client.query<{ id: string; organization_id: string }>(
      "select id, organization_id from facilities limit 1",
    );
    expect(
      await errorCode(
        client,
        "insert into events (organization_id, kind, title, starts_at, ends_at) values ($1, 'training', 'Al revés', now(), now() - interval '1 hour')",
        [facility[0]!.organization_id],
      ),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(
        client,
        "insert into events (organization_id, kind, title, starts_at, ends_at) values ($1, 'fiesta', 'Tipo raro', now(), now() + interval '1 hour')",
        [facility[0]!.organization_id],
      ),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(
        client,
        "insert into facility_hours (organization_id, facility_id, weekday, opens_at, closes_at) values ($1, $2, 8, '09:00', '10:00')",
        [facility[0]!.organization_id, facility[0]!.id],
      ),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(
        client,
        "update organizations set payments_provider = 'paypal' where id = $1",
        [facility[0]!.organization_id],
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it("el entrenamiento del demo (ADR 0039): biblioteca, sesiones con carga, salud con consentimiento y restricciones", async () => {
    const { rows } = await client.query<Record<string, string>>(
      `select
         (select count(*) from training_contents c join organizations o on o.id = c.organization_id where o.slug = 'demo') as contents,
         (select count(*) from drills d join organizations o on o.id = d.organization_id where o.slug = 'demo' and d.seed_key is not null) as drills,
         (select count(*) from training_sessions s join teams t on t.id = s.team_id where t.name = 'Sénior A' and s.status = 'done') as done,
         (select count(*) from player_loads l join organizations o on o.id = l.organization_id where o.slug = 'demo') as loads,
         (select count(*) from injuries i join organizations o on o.id = i.organization_id where o.slug = 'demo') as injuries,
         (select count(*) from health_consents h join organizations o on o.id = h.organization_id where o.slug = 'demo') as consents,
         (select count(*) from player_availability a join organizations o on o.id = a.organization_id where o.slug = 'demo' and a.ended_on is null) as open_periods`,
    );
    expect(Number(rows[0]!.contents)).toBe(17);
    expect(Number(rows[0]!.drills)).toBe(14);
    expect(Number(rows[0]!.done)).toBe(15);
    expect(Number(rows[0]!.loads)).toBeGreaterThan(150);
    expect(Number(rows[0]!.injuries)).toBe(1);
    expect(Number(rows[0]!.consents)).toBe(2);
    expect(Number(rows[0]!.open_periods)).toBe(2);

    // Un periodo abierto por jugador; una carga por entrenamiento y jugador; RPE de 0 a 10.
    const { rows: open } = await client.query<{ organization_id: string; player_id: string }>(
      "select organization_id, player_id from player_availability where ended_on is null limit 1",
    );
    expect(
      await errorCode(
        client,
        "insert into player_availability (organization_id, player_id, status, from_on) values ($1, $2, 'out', current_date)",
        [open[0]!.organization_id, open[0]!.player_id],
      ),
    ).toBe(UNIQUE_VIOLATION);
    expect(
      await errorCode(client, "update player_loads set rpe = 11 where source = 'session'"),
    ).toBe(CHECK_VIOLATION);
    expect(
      await errorCode(
        client,
        "update training_sessions set md_label = 'MD-9' where status = 'done'",
      ),
    ).toBe(CHECK_VIOLATION);
    expect(await errorCode(client, "update wellness_entries set soreness = 0")).toBe(
      CHECK_VIOLATION,
    );
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
