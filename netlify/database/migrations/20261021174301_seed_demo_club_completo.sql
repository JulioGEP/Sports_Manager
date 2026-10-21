-- Club de demostración, club completo (Bloques 14 a 18, ADR 0031): tres secciones nuevas
-- (Baloncesto, Natación y Yoga) con categorías, equipos y grupos, personas y deportistas, socios con
-- tipos de socio, instalaciones con franjas, horarios semanales con la agenda de la temporada
-- generada, partidos, planes de cuota con cargos y pagos, y cuatro cuentas más de personal.
-- Todos los datos son ficticios. Idempotente: cada inserción salta si ya existe.

-- Cuentas de personal: contraseña 123456 (mismo hash que admin@demo.test)
INSERT INTO "users" ("name", "email", "email_verified", "locale")
VALUES ('Núria Solé', 'natacion@demo.test', true, 'es'),
       ('Jordi Serra', 'basquet@demo.test', true, 'es'),
       ('Laia Roca', 'basquetfem@demo.test', true, 'es'),
       ('Marta Pons', 'yoga@demo.test', true, 'es')
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "password")
SELECT u."id", u."id"::text, 'credential',
  '8d2c12c3c744c97c5b5162d6019c7d65:df7ac8f57557ed6e35ee523192b487cd7fcb5ec52f3eaed1e37818c7532a4da7ac916e660df1913d750da551dc1494b1f2c98441daa7e0b423d8f6aeef5d372b'
FROM "users" u
WHERE u."email" IN ('natacion@demo.test', 'basquet@demo.test', 'basquetfem@demo.test', 'yoga@demo.test')
  AND NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential');

INSERT INTO "memberships" ("user_id", "organization_id", "role_code", "position")
SELECT u."id", o."id", v."role", v."position"
FROM "organizations" o
JOIN (VALUES ('natacion@demo.test', 'staff', 'coordinator'), ('basquet@demo.test', 'coach', NULL),
             ('basquetfem@demo.test', 'coach', NULL), ('yoga@demo.test', 'coach', NULL)) AS v("email", "role", "position") ON true
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo'
ON CONFLICT DO NOTHING;

-- Secciones nuevas con su deporte y tipo; la de fútbol sala gana coordinación.
INSERT INTO "sections" ("organization_id", "name", "sport_id", "kind", "sort_order", "coordinator_user_id")
SELECT o."id", v."name", s."id", v."kind", v."sort", u."id"
FROM "organizations" o
JOIN (VALUES ('Baloncesto', 'basketball', 'competition', 20, NULL),
             ('Natación', 'swimming', 'activity', 30, 'natacion@demo.test'),
             ('Yoga', 'yoga', 'activity', 40, 'yoga@demo.test')) AS v("name", "sport", "kind", "sort", "coordinator") ON true
JOIN "sports" s ON s."code" = v."sport"
LEFT JOIN "users" u ON u."email" = v."coordinator"
WHERE o."slug" = 'demo'
ON CONFLICT ("organization_id", "name") DO NOTHING;

UPDATE "sections" s SET "coordinator_user_id" = u."id"
FROM "organizations" o, "users" u
WHERE o."slug" = 'demo' AND s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
  AND u."email" = 'director@demo.test' AND s."coordinator_user_id" IS NULL;

-- Categorías: años de nacimiento orientativos para las de fútbol sala y las nuevas.
UPDATE "categories" c SET "gender" = 'mixed', "birth_year_from" = v."from", "birth_year_to" = v."to"
FROM "organizations" o, "sections" s,
  (VALUES ('Prebenjamín', 2019, 2020), ('Benjamín', 2017, 2018), ('Alevín', 2015, 2016), ('Infantil', 2013, 2014)) AS v("name", "from", "to")
WHERE o."slug" = 'demo' AND s."organization_id" = o."id" AND s."name" = 'Fútbol sala'
  AND c."section_id" = s."id" AND c."name" = v."name" AND c."birth_year_from" IS NULL;

INSERT INTO "categories" ("organization_id", "section_id", "name", "gender", "birth_year_from", "birth_year_to", "sort_order")
SELECT o."id", s."id", v."name", v."gender", v."from", v."to", v."sort"
FROM "organizations" o
JOIN "sections" s ON s."organization_id" = o."id"
JOIN (VALUES
  ('Fútbol sala', 'Cadete', 'mixed', 2011, 2012, 50),
  ('Baloncesto', 'Sénior masculino', 'male', NULL, 2008, 10),
  ('Baloncesto', 'Sénior femenino', 'female', NULL, 2008, 20),
  ('Baloncesto', 'Júnior', 'mixed', 2009, 2010, 30),
  ('Natación', 'Iniciación', 'mixed', 2018, 2021, 10),
  ('Natación', 'Perfeccionamiento', 'mixed', 2012, 2017, 20),
  ('Natación', 'Máster', 'mixed', NULL, 2001, 30),
  ('Yoga', 'Adultos', NULL, NULL, NULL, 10)
) AS v("section", "name", "gender", "from", "to", "sort") ON v."section" = s."name"
WHERE o."slug" = 'demo'
ON CONFLICT ("section_id", "name") DO NOTHING;

-- Equipos y grupos de la temporada actual
INSERT INTO "teams" ("organization_id", "section_id", "category_id", "season_id", "name", "capacity")
SELECT o."id", s."id", c."id", sea."id", v."team", v."capacity"
FROM "organizations" o
JOIN "seasons" sea ON sea."organization_id" = o."id" AND sea."name" = '2026-27'
JOIN "sections" s ON s."organization_id" = o."id"
JOIN "categories" c ON c."section_id" = s."id"
JOIN (VALUES
  ('Baloncesto', 'Sénior masculino', 'Sénior masculino A', NULL),
  ('Baloncesto', 'Sénior femenino', 'Sénior femenino A', NULL),
  ('Natación', 'Iniciación', 'Iniciación lunes y miércoles', 12),
  ('Natación', 'Perfeccionamiento', 'Perfeccionamiento martes y jueves', 12),
  ('Natación', 'Máster', 'Máster sábados', 10),
  ('Yoga', 'Adultos', 'Yoga suave lunes', 12),
  ('Yoga', 'Adultos', 'Yoga dinámico jueves', 12)
) AS v("section", "category", "team", "capacity") ON v."section" = s."name" AND v."category" = c."name"
WHERE o."slug" = 'demo'
ON CONFLICT ("season_id", "section_id", "name") DO NOTHING;

-- Personas del club (adultos con contacto). Salta las que ya existen por nombre y apellidos.
INSERT INTO "people" ("organization_id", "first_name", "last_name", "birth_date", "gender", "email", "phone")
SELECT o."id", v."first", v."last", v."birth"::date, v."gender", v."email", v."phone"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Pau', 'Ferran', '1998-03-14', 'male', 'pau.ferran@demo.test', '694770566'),
  ('Arnau', 'Llopis', '1997-07-22', 'male', 'arnau.llopis@demo.test', '653603228'),
  ('Gerard', 'Mir', '2000-01-09', 'male', 'gerard.mir@demo.test', '660016184'),
  ('Oriol', 'Batlle', '1996-11-30', 'male', 'oriol.batlle@demo.test', '681861465'),
  ('Xavi', 'Dalmau', '1995-05-18', 'male', 'xavi.dalmau@demo.test', '684070201'),
  ('Ismael', 'Reyes', '2001-09-02', 'male', 'ismael.reyes@demo.test', '651957066'),
  ('Joan', 'Peris', '1999-02-27', 'male', 'joan.peris@demo.test', '605594161'),
  ('Nil', 'Bonet', '2002-06-15', 'male', 'nil.bonet@demo.test', '645244898'),
  ('Eric', 'Salvat', '1998-12-03', 'male', 'eric.salvat@demo.test', '636181344'),
  ('Àlex', 'Ventura', '2003-04-21', 'male', 'alex.ventura@demo.test', '686444464'),
  ('Aina', 'Rovira', '1999-08-11', 'female', 'aina.rovira@demo.test', '675238117'),
  ('Mar', 'Teixidó', '1998-02-05', 'female', 'mar.teixido@demo.test', '605324314'),
  ('Laia', 'Dachs', '2000-10-19', 'female', 'laia.dachs@demo.test', '619303830'),
  ('Júlia', 'Pascual', '1997-06-28', 'female', 'julia.pascual@demo.test', '619522980'),
  ('Carla', 'Oliver', '1996-03-09', 'female', 'carla.oliver@demo.test', '601792975'),
  ('Ona', 'Benet', '2001-12-14', 'female', 'ona.benet@demo.test', '659377718'),
  ('Anna', 'Figueras', '2002-07-01', 'female', 'anna.figueras@demo.test', '637232926'),
  ('Marina', 'Cuadrat', '1999-04-23', 'female', 'marina.cuadrat@demo.test', '685822732'),
  ('Berta', 'Alsina', '2003-01-30', 'female', 'berta.alsina@demo.test', '620422131'),
  ('Irene', 'Vallès', '1998-09-17', 'female', 'irene.valles@demo.test', '655477361'),
  ('Lia', 'Amat', '2019-05-12', 'female', NULL, NULL),
  ('Max', 'Boix', '2020-02-03', 'male', NULL, NULL),
  ('Nora', 'Cerdà', '2018-11-25', 'female', NULL, NULL),
  ('Pol', 'Duran', '2019-08-08', 'male', NULL, NULL),
  ('Vera', 'Espí', '2020-06-19', 'female', NULL, NULL),
  ('Teo', 'Fortuny', '2018-03-30', 'male', NULL, NULL),
  ('Martí', 'Grau', '2014-04-16', 'male', NULL, NULL),
  ('Clàudia', 'Homs', '2013-09-07', 'female', NULL, NULL),
  ('Biel', 'Isern', '2015-01-22', 'male', NULL, NULL),
  ('Elna', 'Jordà', '2012-12-11', 'female', NULL, NULL),
  ('Roc', 'Llovet', '2016-07-03', 'male', NULL, NULL),
  ('Abril', 'Mestre', '2014-10-29', 'female', NULL, NULL),
  ('Sergi', 'Noguera', '1985-02-14', 'male', 'sergi.noguera@demo.test', '693185999'),
  ('Montse', 'Oller', '1979-07-09', 'female', 'montse.oller@demo.test', '616667278'),
  ('Ramon', 'Pagès', '1972-11-02', 'male', 'ramon.pages@demo.test', '606114183'),
  ('Eva', 'Quintana', '1990-05-27', 'female', 'eva.quintana@demo.test', '692342086'),
  ('Toni', 'Rius', '1968-09-15', 'male', 'toni.rius@demo.test', '641248073'),
  ('Carme', 'Segura', '1965-03-03', 'female', 'carme.segura@demo.test', '618945044'),
  ('Josep', 'Tarragó', '1958-08-21', 'male', 'josep.tarrago@demo.test', '635566176'),
  ('Dolors', 'Ubach', '1962-12-30', 'female', 'dolors.ubach@demo.test', '659112807'),
  ('Pere', 'Valls', '1970-06-06', 'male', 'pere.valls@demo.test', '692300766'),
  ('Rosa', 'Xifré', '1975-01-17', 'female', 'rosa.xifre@demo.test', '636726144'),
  ('Marta', 'Zaragoza', '1988-10-10', 'female', 'marta.zaragoza@demo.test', '685010781'),
  ('Albert', 'Agustí', '1992-04-04', 'male', 'albert.agusti@demo.test', '638329372'),
  ('Neus', 'Baró', '1986-07-23', 'female', 'neus.baro@demo.test', '658750558'),
  ('Quim', 'Castellà', '1995-11-11', 'male', 'quim.castella@demo.test', '670444726'),
  ('Sílvia', 'Domènech', '1990-02-19', 'female', 'silvia.domenech@demo.test', '655324130'),
  ('Ferran', 'Abella', '1960-04-12', 'male', 'ferran.abella@demo.test', '630206138'),
  ('Pilar', 'Bellver', '1955-09-30', 'female', 'pilar.bellver@demo.test', '624002766'),
  ('Jordi', 'Canals', '1978-01-25', 'male', 'jordi.canals@demo.test', '631560472'),
  ('Mercè', 'Dalmases', '1982-06-14', 'female', 'merce.dalmases@demo.test', '687469645'),
  ('Lluís', 'Escolà', '1949-12-02', 'male', 'lluis.escolà@demo.test', '695220466'),
  ('Teresa', 'Farré', '1967-03-21', 'female', 'teresa.farre@demo.test', '637841599'),
  ('Enric', 'Gassó', '1973-08-08', 'male', 'enric.gassó@demo.test', '697402012'),
  ('Núria', 'Homar', '1984-11-17', 'female', 'nuria.homar@demo.test', '684243576'),
  ('Ignasi', 'Juncosa', '1991-05-05', 'male', 'ignasi.juncosa@demo.test', '626884676'),
  ('Laura', 'Llach', '1980-10-23', 'female', 'laura.llach@demo.test', '679831842'),
  ('Miquel', 'Mallol', '1963-02-09', 'male', 'miquel.mallol@demo.test', '669584817'),
  ('Anna', 'Noguès', '1977-07-27', 'female', 'anna.nogues@demo.test', '617037408')
) AS v("first", "last", "birth", "gender", "email", "phone")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "people" x WHERE x."organization_id" = o."id" AND x."first_name" = v."first" AND x."last_name" = v."last");

-- Deportistas: una ficha por persona que entrena, con fecha de alta.
INSERT INTO "players" ("organization_id", "person_id", "joined_on", "status")
SELECT o."id", x."id", DATE '2026-09-01', 'active'
FROM "organizations" o
JOIN "people" x ON x."organization_id" = o."id"
JOIN (VALUES
  ('Pau', 'Ferran'),
  ('Arnau', 'Llopis'),
  ('Gerard', 'Mir'),
  ('Oriol', 'Batlle'),
  ('Xavi', 'Dalmau'),
  ('Ismael', 'Reyes'),
  ('Joan', 'Peris'),
  ('Nil', 'Bonet'),
  ('Eric', 'Salvat'),
  ('Àlex', 'Ventura'),
  ('Aina', 'Rovira'),
  ('Mar', 'Teixidó'),
  ('Laia', 'Dachs'),
  ('Júlia', 'Pascual'),
  ('Carla', 'Oliver'),
  ('Ona', 'Benet'),
  ('Anna', 'Figueras'),
  ('Marina', 'Cuadrat'),
  ('Berta', 'Alsina'),
  ('Irene', 'Vallès'),
  ('Lia', 'Amat'),
  ('Max', 'Boix'),
  ('Nora', 'Cerdà'),
  ('Pol', 'Duran'),
  ('Vera', 'Espí'),
  ('Teo', 'Fortuny'),
  ('Martí', 'Grau'),
  ('Clàudia', 'Homs'),
  ('Biel', 'Isern'),
  ('Elna', 'Jordà'),
  ('Roc', 'Llovet'),
  ('Abril', 'Mestre'),
  ('Sergi', 'Noguera'),
  ('Montse', 'Oller'),
  ('Ramon', 'Pagès'),
  ('Eva', 'Quintana'),
  ('Toni', 'Rius'),
  ('Carme', 'Segura'),
  ('Josep', 'Tarragó'),
  ('Dolors', 'Ubach'),
  ('Pere', 'Valls'),
  ('Rosa', 'Xifré'),
  ('Marta', 'Zaragoza'),
  ('Albert', 'Agustí'),
  ('Neus', 'Baró'),
  ('Quim', 'Castellà'),
  ('Sílvia', 'Domènech')
) AS v("first", "last") ON v."first" = x."first_name" AND v."last" = x."last_name"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "players" p WHERE p."person_id" = x."id");

-- Plantillas e inscritos
INSERT INTO "team_players" ("organization_id", "team_id", "player_id", "shirt_number", "position")
SELECT o."id", t."id", p."id", v."shirt", v."position"
FROM "organizations" o
JOIN "people" x ON x."organization_id" = o."id"
JOIN "players" p ON p."person_id" = x."id"
JOIN (VALUES
  ('Sénior masculino A', 'Pau', 'Ferran', 4, 'Base'),
  ('Sénior masculino A', 'Arnau', 'Llopis', 5, 'Escolta'),
  ('Sénior masculino A', 'Gerard', 'Mir', 6, 'Alero'),
  ('Sénior masculino A', 'Oriol', 'Batlle', 7, 'Ala-pívot'),
  ('Sénior masculino A', 'Xavi', 'Dalmau', 8, 'Pívot'),
  ('Sénior masculino A', 'Ismael', 'Reyes', 9, 'Base'),
  ('Sénior masculino A', 'Joan', 'Peris', 10, 'Escolta'),
  ('Sénior masculino A', 'Nil', 'Bonet', 11, 'Alero'),
  ('Sénior masculino A', 'Eric', 'Salvat', 12, 'Ala-pívot'),
  ('Sénior masculino A', 'Àlex', 'Ventura', 13, 'Pívot'),
  ('Sénior femenino A', 'Aina', 'Rovira', 4, 'Base'),
  ('Sénior femenino A', 'Mar', 'Teixidó', 5, 'Escolta'),
  ('Sénior femenino A', 'Laia', 'Dachs', 6, 'Alero'),
  ('Sénior femenino A', 'Júlia', 'Pascual', 7, 'Ala-pívot'),
  ('Sénior femenino A', 'Carla', 'Oliver', 8, 'Pívot'),
  ('Sénior femenino A', 'Ona', 'Benet', 9, 'Base'),
  ('Sénior femenino A', 'Anna', 'Figueras', 10, 'Escolta'),
  ('Sénior femenino A', 'Marina', 'Cuadrat', 11, 'Alero'),
  ('Sénior femenino A', 'Berta', 'Alsina', 12, 'Ala-pívot'),
  ('Sénior femenino A', 'Irene', 'Vallès', 13, 'Pívot'),
  ('Iniciación lunes y miércoles', 'Lia', 'Amat', NULL, NULL),
  ('Iniciación lunes y miércoles', 'Max', 'Boix', NULL, NULL),
  ('Iniciación lunes y miércoles', 'Nora', 'Cerdà', NULL, NULL),
  ('Iniciación lunes y miércoles', 'Pol', 'Duran', NULL, NULL),
  ('Iniciación lunes y miércoles', 'Vera', 'Espí', NULL, NULL),
  ('Iniciación lunes y miércoles', 'Teo', 'Fortuny', NULL, NULL),
  ('Perfeccionamiento martes y jueves', 'Martí', 'Grau', NULL, NULL),
  ('Perfeccionamiento martes y jueves', 'Clàudia', 'Homs', NULL, NULL),
  ('Perfeccionamiento martes y jueves', 'Biel', 'Isern', NULL, NULL),
  ('Perfeccionamiento martes y jueves', 'Elna', 'Jordà', NULL, NULL),
  ('Perfeccionamiento martes y jueves', 'Roc', 'Llovet', NULL, NULL),
  ('Perfeccionamiento martes y jueves', 'Abril', 'Mestre', NULL, NULL),
  ('Máster sábados', 'Sergi', 'Noguera', NULL, NULL),
  ('Máster sábados', 'Montse', 'Oller', NULL, NULL),
  ('Máster sábados', 'Ramon', 'Pagès', NULL, NULL),
  ('Máster sábados', 'Eva', 'Quintana', NULL, NULL),
  ('Máster sábados', 'Toni', 'Rius', NULL, NULL),
  ('Yoga suave lunes', 'Carme', 'Segura', NULL, NULL),
  ('Yoga suave lunes', 'Josep', 'Tarragó', NULL, NULL),
  ('Yoga suave lunes', 'Dolors', 'Ubach', NULL, NULL),
  ('Yoga suave lunes', 'Pere', 'Valls', NULL, NULL),
  ('Yoga suave lunes', 'Rosa', 'Xifré', NULL, NULL),
  ('Yoga dinámico jueves', 'Marta', 'Zaragoza', NULL, NULL),
  ('Yoga dinámico jueves', 'Albert', 'Agustí', NULL, NULL),
  ('Yoga dinámico jueves', 'Neus', 'Baró', NULL, NULL),
  ('Yoga dinámico jueves', 'Quim', 'Castellà', NULL, NULL),
  ('Yoga dinámico jueves', 'Sílvia', 'Domènech', NULL, NULL)
) AS v("team", "first", "last", "shirt", "position") ON v."first" = x."first_name" AND v."last" = x."last_name"
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = v."team"
WHERE o."slug" = 'demo'
ON CONFLICT ("team_id", "player_id") DO NOTHING;

-- Cuerpo técnico de los equipos y grupos nuevos
INSERT INTO "team_staff" ("organization_id", "team_id", "user_id", "role_in_team")
SELECT o."id", t."id", u."id", 'head_coach'
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id"
JOIN (VALUES
  ('Sénior masculino A', 'basquet@demo.test'), ('Sénior femenino A', 'basquetfem@demo.test'),
  ('Iniciación lunes y miércoles', 'natacion@demo.test'), ('Perfeccionamiento martes y jueves', 'natacion@demo.test'),
  ('Máster sábados', 'natacion@demo.test'), ('Yoga suave lunes', 'yoga@demo.test')
) AS v("team", "email") ON v."team" = t."name"
JOIN "users" u ON u."email" = v."email"
WHERE o."slug" = 'demo'
ON CONFLICT ("team_id", "user_id") DO NOTHING;

-- Tipos de socio
INSERT INTO "member_types" ("organization_id", "name", "sort_order")
SELECT o."id", v."name", v."sort"
FROM "organizations" o
CROSS JOIN (VALUES ('Socio', 10), ('Socio familiar', 20), ('Abonado piscina', 30)) AS v("name", "sort")
WHERE o."slug" = 'demo'
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- Socios: los adultos que entrenan, los socios que solo lo son y la familia Martí. Número correlativo.
INSERT INTO "club_members" ("organization_id", "person_id", "member_number", "member_type_id", "joined_on", "status")
SELECT o."id", x."id", (SELECT COALESCE(MAX(m."member_number"), 0) FROM "club_members" m WHERE m."organization_id" = o."id") + row_number() OVER (ORDER BY v."ord"),
  mt."id", v."joined"::date, 'active'
FROM "organizations" o
JOIN "people" x ON x."organization_id" = o."id"
JOIN (VALUES
  ('Laura', 'Martí', 'Socio familiar', '2022-09-01', 0),
  ('Pau', 'Ferran', 'Socio', '2026-09-01', 1),
  ('Arnau', 'Llopis', 'Socio', '2026-09-01', 2),
  ('Gerard', 'Mir', 'Socio', '2026-09-01', 3),
  ('Oriol', 'Batlle', 'Socio', '2026-09-01', 4),
  ('Xavi', 'Dalmau', 'Socio', '2026-09-01', 5),
  ('Ismael', 'Reyes', 'Socio', '2026-09-01', 6),
  ('Joan', 'Peris', 'Socio', '2026-09-01', 7),
  ('Nil', 'Bonet', 'Socio', '2026-09-01', 8),
  ('Eric', 'Salvat', 'Socio', '2026-09-01', 9),
  ('Àlex', 'Ventura', 'Socio', '2026-09-01', 10),
  ('Aina', 'Rovira', 'Socio', '2026-09-01', 11),
  ('Mar', 'Teixidó', 'Socio', '2026-09-01', 12),
  ('Laia', 'Dachs', 'Socio', '2026-09-01', 13),
  ('Júlia', 'Pascual', 'Socio', '2026-09-01', 14),
  ('Carla', 'Oliver', 'Socio', '2026-09-01', 15),
  ('Ona', 'Benet', 'Socio', '2026-09-01', 16),
  ('Anna', 'Figueras', 'Socio', '2026-09-01', 17),
  ('Marina', 'Cuadrat', 'Socio', '2026-09-01', 18),
  ('Berta', 'Alsina', 'Socio', '2026-09-01', 19),
  ('Irene', 'Vallès', 'Socio', '2026-09-01', 20),
  ('Sergi', 'Noguera', 'Abonado piscina', '2024-09-01', 21),
  ('Montse', 'Oller', 'Abonado piscina', '2024-09-01', 22),
  ('Ramon', 'Pagès', 'Abonado piscina', '2024-09-01', 23),
  ('Eva', 'Quintana', 'Abonado piscina', '2026-09-01', 24),
  ('Toni', 'Rius', 'Abonado piscina', '2024-09-01', 25),
  ('Carme', 'Segura', 'Socio', '2024-09-01', 26),
  ('Josep', 'Tarragó', 'Socio', '2024-09-01', 27),
  ('Dolors', 'Ubach', 'Socio', '2024-09-01', 28),
  ('Pere', 'Valls', 'Socio', '2024-09-01', 29),
  ('Rosa', 'Xifré', 'Socio', '2024-09-01', 30),
  ('Marta', 'Zaragoza', 'Socio', '2024-09-01', 31),
  ('Albert', 'Agustí', 'Socio', '2026-09-01', 32),
  ('Neus', 'Baró', 'Socio', '2024-09-01', 33),
  ('Quim', 'Castellà', 'Socio', '2026-09-01', 34),
  ('Sílvia', 'Domènech', 'Socio', '2026-09-01', 35),
  ('Ferran', 'Abella', 'Socio', '2019-01-15', 36),
  ('Pilar', 'Bellver', 'Abonado piscina', '2026-10-05', 37),
  ('Jordi', 'Canals', 'Socio familiar', '2019-01-15', 38),
  ('Mercè', 'Dalmases', 'Socio', '2026-10-05', 39),
  ('Lluís', 'Escolà', 'Abonado piscina', '2019-01-15', 40),
  ('Teresa', 'Farré', 'Socio familiar', '2026-10-05', 41),
  ('Enric', 'Gassó', 'Socio', '2019-01-15', 42),
  ('Núria', 'Homar', 'Abonado piscina', '2026-10-05', 43),
  ('Ignasi', 'Juncosa', 'Socio familiar', '2019-01-15', 44),
  ('Laura', 'Llach', 'Socio', '2026-10-05', 45),
  ('Miquel', 'Mallol', 'Abonado piscina', '2019-01-15', 46),
  ('Anna', 'Noguès', 'Socio familiar', '2026-10-05', 47)
) AS v("first", "last", "type", "joined", "ord") ON v."first" = x."first_name" AND v."last" = x."last_name"
JOIN "member_types" mt ON mt."organization_id" = o."id" AND mt."name" = v."type"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "club_members" m WHERE m."person_id" = x."id");

-- Instalaciones y franjas de apertura
INSERT INTO "facilities" ("organization_id", "name", "kind", "capacity", "sort_order", "description")
SELECT o."id", v."name", v."kind", v."capacity", v."sort", v."description"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Pabellón pista 1', 'court', 200, 10, 'Pista cubierta de parqué, 40 x 20.'),
  ('Pista 2 exterior', 'court', 60, 20, 'Pista exterior de hormigón pulido.'),
  ('Piscina 25 m', 'pool', 60, 30, 'Seis calles, climatizada.'),
  ('Sala polivalente', 'room', 20, 40, 'Suelo de madera, espejos y material de yoga.')
) AS v("name", "kind", "capacity", "sort", "description")
WHERE o."slug" = 'demo'
ON CONFLICT ("organization_id", "name") DO NOTHING;

INSERT INTO "facility_hours" ("organization_id", "facility_id", "weekday", "opens_at", "closes_at")
SELECT o."id", f."id", d."weekday", CASE WHEN d."weekday" = 6 THEN '09:00' ELSE '09:00' END, CASE WHEN d."weekday" = 6 THEN '14:00' ELSE '22:00' END
FROM "organizations" o
JOIN "facilities" f ON f."organization_id" = o."id"
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS d("weekday")
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "facility_hours" h WHERE h."facility_id" = f."id");

-- Horario semanal de cada equipo y grupo
INSERT INTO "team_schedules" ("organization_id", "team_id", "weekday", "starts_at", "ends_at", "facility_id")
SELECT o."id", t."id", v."weekday", v."starts", v."ends", f."id"
FROM "organizations" o
JOIN "teams" t ON t."organization_id" = o."id"
JOIN (VALUES
  ('Prebenjamín A', 1, '17:00', '18:00', 'Pista 2 exterior'), ('Prebenjamín A', 3, '17:00', '18:00', 'Pista 2 exterior'),
  ('Benjamín A', 1, '18:00', '19:00', 'Pista 2 exterior'), ('Benjamín A', 3, '18:00', '19:00', 'Pista 2 exterior'),
  ('Alevín A', 2, '17:30', '18:30', 'Pabellón pista 1'), ('Alevín A', 4, '17:30', '18:30', 'Pabellón pista 1'),
  ('Infantil A', 2, '18:30', '19:30', 'Pabellón pista 1'), ('Infantil A', 4, '18:30', '19:30', 'Pabellón pista 1'),
  ('Sénior masculino A', 2, '20:30', '22:00', 'Pabellón pista 1'), ('Sénior masculino A', 4, '20:30', '22:00', 'Pabellón pista 1'),
  ('Sénior femenino A', 1, '20:30', '22:00', 'Pabellón pista 1'), ('Sénior femenino A', 3, '20:30', '22:00', 'Pabellón pista 1'),
  ('Iniciación lunes y miércoles', 1, '17:30', '18:30', 'Piscina 25 m'), ('Iniciación lunes y miércoles', 3, '17:30', '18:30', 'Piscina 25 m'),
  ('Perfeccionamiento martes y jueves', 2, '18:30', '19:30', 'Piscina 25 m'), ('Perfeccionamiento martes y jueves', 4, '18:30', '19:30', 'Piscina 25 m'),
  ('Máster sábados', 6, '10:00', '11:30', 'Piscina 25 m'),
  ('Yoga suave lunes', 1, '19:00', '20:00', 'Sala polivalente'),
  ('Yoga dinámico jueves', 4, '20:00', '21:00', 'Sala polivalente')
) AS v("team", "weekday", "starts", "ends", "facility") ON v."team" = t."name"
JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = v."facility"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "team_schedules" ts WHERE ts."team_id" = t."id");

-- Agenda de la temporada generada desde los horarios: una sesión por semana y franja, en la zona del club.
INSERT INTO "events" ("organization_id", "kind", "title", "section_id", "team_id", "facility_id", "starts_at", "ends_at", "series_id")
SELECT o."id",
  CASE s."kind" WHEN 'activity' THEN 'activity' ELSE 'training' END,
  CASE s."kind" WHEN 'activity' THEN t."name" ELSE 'Entrenamiento ' || t."name" END,
  s."id", t."id", ts."facility_id",
  ((d."day"::date + ts."starts_at"::time) AT TIME ZONE o."timezone"),
  ((d."day"::date + ts."ends_at"::time) AT TIME ZONE o."timezone"),
  ts."id"
FROM "organizations" o
JOIN "seasons" sea ON sea."organization_id" = o."id" AND sea."is_current"
JOIN "teams" t ON t."organization_id" = o."id" AND t."season_id" = sea."id"
JOIN "sections" s ON s."id" = t."section_id"
JOIN "team_schedules" ts ON ts."team_id" = t."id"
JOIN LATERAL generate_series(GREATEST(sea."starts_on", DATE '2026-09-07'), sea."ends_on", INTERVAL '1 day') AS d("day") ON EXTRACT(ISODOW FROM d."day") = ts."weekday"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."series_id" = ts."id");

-- Partidos y una reunión
INSERT INTO "events" ("organization_id", "kind", "title", "section_id", "team_id", "facility_id", "starts_at", "ends_at", "opponent", "home_away", "location")
SELECT o."id", v."kind", v."title", s."id", t."id", f."id",
  (v."starts"::timestamp AT TIME ZONE o."timezone"), (v."ends"::timestamp AT TIME ZONE o."timezone"), v."opponent", v."home_away", v."location"
FROM "organizations" o
JOIN (VALUES
  ('match', 'Sénior femenino A vs CB Horta', 'Sénior femenino A', 'Pabellón pista 1', '2026-10-21 20:30', '2026-10-21 22:00', 'CB Horta', 'home', NULL),
  ('match', 'UE Sant Cugat vs Sénior femenino A', 'Sénior femenino A', NULL, '2026-10-28 20:30', '2026-10-28 22:00', 'UE Sant Cugat', 'away', 'Pavelló de Sant Cugat'),
  ('match', 'Sénior femenino A vs CB Vic', 'Sénior femenino A', 'Pabellón pista 1', '2026-11-04 20:30', '2026-11-04 22:00', 'CB Vic', 'home', NULL),
  ('match', 'Sénior masculino A vs CB Badalona B', 'Sénior masculino A', 'Pabellón pista 1', '2026-10-24 18:00', '2026-10-24 19:45', 'CB Badalona B', 'home', NULL),
  ('match', 'CB Mataró vs Sénior masculino A', 'Sénior masculino A', NULL, '2026-10-31 19:00', '2026-10-31 20:45', 'CB Mataró', 'away', 'Pavelló Teresa Maria Roca, Mataró'),
  ('match', 'Alevín A vs FS Gràcia', 'Alevín A', 'Pabellón pista 1', '2026-10-24 11:00', '2026-10-24 12:00', 'FS Gràcia', 'home', NULL),
  ('match', 'FS Horta vs Infantil A', 'Infantil A', NULL, '2026-10-25 10:00', '2026-10-25 11:15', 'FS Horta', 'away', 'Pavelló Municipal d''Horta'),
  ('match', 'Benjamín A vs CE Sants', 'Benjamín A', 'Pista 2 exterior', '2026-10-24 09:30', '2026-10-24 10:30', 'CE Sants', 'home', NULL)
) AS v("kind", "title", "team", "facility", "starts", "ends", "opponent", "home_away", "location") ON true
JOIN "teams" t ON t."organization_id" = o."id" AND t."name" = v."team"
JOIN "sections" s ON s."id" = t."section_id"
LEFT JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = v."facility"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."organization_id" = o."id" AND e."title" = v."title");

INSERT INTO "events" ("organization_id", "kind", "title", "facility_id", "starts_at", "ends_at", "notes")
SELECT o."id", 'meeting', 'Reunión de coordinación de secciones', f."id",
  (TIMESTAMP '2026-10-22 19:00' AT TIME ZONE o."timezone"), (TIMESTAMP '2026-10-22 20:00' AT TIME ZONE o."timezone"),
  'Calendario de partidos de noviembre y reparto de pistas.'
FROM "organizations" o
JOIN "facilities" f ON f."organization_id" = o."id" AND f."name" = 'Sala polivalente'
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."organization_id" = o."id" AND e."title" = 'Reunión de coordinación de secciones');

-- Planes de cuota
INSERT INTO "fee_plans" ("organization_id", "name", "amount_cents", "period", "member_type_id", "section_id", "description")
SELECT o."id", v."name", v."amount", 'monthly', mt."id", s."id", v."description"
FROM "organizations" o
JOIN (VALUES
  ('Cuota de socio', 1000, 'Socio', NULL, 'Cuota mensual de socio del club.'),
  ('Cuota de socio familiar', 1500, 'Socio familiar', NULL, 'Para las familias con deportistas menores.'),
  ('Abono de piscina', 3500, 'Abonado piscina', NULL, 'Acceso libre a la piscina en horario de apertura.'),
  ('Cuota de fútbol sala', 4000, NULL, 'Fútbol sala', 'Entrenamientos y competición.'),
  ('Cuota de baloncesto', 4500, NULL, 'Baloncesto', 'Entrenamientos y competición.'),
  ('Cuota de natación', 3800, NULL, 'Natación', 'Dos sesiones semanales.'),
  ('Cuota de yoga', 3000, NULL, 'Yoga', 'Una sesión semanal.')
) AS v("name", "amount", "member_type", "section", "description") ON true
LEFT JOIN "member_types" mt ON mt."organization_id" = o."id" AND mt."name" = v."member_type"
LEFT JOIN "sections" s ON s."organization_id" = o."id" AND s."name" = v."section"
WHERE o."slug" = 'demo'
  AND NOT EXISTS (SELECT 1 FROM "fee_plans" p WHERE p."organization_id" = o."id" AND p."name" = v."name");

-- Cargos de septiembre y octubre: a quien aplica cada plan (tipo de socio o sección del deportista).
WITH demo AS (SELECT o."id" AS org_id FROM "organizations" o WHERE o."slug" = 'demo'),
periods AS (
  SELECT * FROM (VALUES ('Septiembre 2026', DATE '2026-09-05'), ('Octubre 2026', DATE '2026-10-05')) AS v("label", "due")
),
targets AS (
  SELECT p."id" AS plan_id, p."name", p."amount_cents", m."person_id"
  FROM "fee_plans" p
  JOIN "club_members" m ON m."organization_id" = p."organization_id" AND m."member_type_id" = p."member_type_id" AND m."status" = 'active'
  WHERE p."organization_id" = (SELECT org_id FROM demo) AND p."member_type_id" IS NOT NULL
  UNION
  SELECT DISTINCT p."id", p."name", p."amount_cents", pl."person_id"
  FROM "fee_plans" p
  JOIN "teams" t ON t."organization_id" = p."organization_id" AND t."section_id" = p."section_id"
  JOIN "team_players" tp ON tp."team_id" = t."id"
  JOIN "players" pl ON pl."id" = tp."player_id"
  WHERE p."organization_id" = (SELECT org_id FROM demo) AND p."section_id" IS NOT NULL
)
INSERT INTO "fee_charges" ("organization_id", "person_id", "fee_plan_id", "concept", "period_label", "amount_cents", "due_on", "status")
SELECT demo.org_id, tg."person_id", tg.plan_id, tg."name" || ' · ' || pe."label", pe."label", tg."amount_cents", pe."due", 'pending'
FROM demo, targets tg
CROSS JOIN periods pe
WHERE NOT EXISTS (
  SELECT 1 FROM "fee_charges" c WHERE c."organization_id" = demo.org_id AND c."person_id" = tg."person_id" AND c."fee_plan_id" = tg.plan_id AND c."period_label" = pe."label"
);

-- Pagos: septiembre cobrado entero; octubre, siete de cada diez. El resto queda pendiente o vencido.
INSERT INTO "payments" ("organization_id", "charge_id", "amount_cents", "method", "paid_on", "note")
SELECT c."organization_id", c."id", c."amount_cents",
  CASE WHEN (('x' || substr(md5(c."id"::text), 1, 8))::bit(32)::int % 3) = 0 THEN 'cash' ELSE 'transfer' END,
  c."due_on" - ((('x' || substr(md5(c."id"::text), 1, 8))::bit(32)::int % 5)) * INTERVAL '1 day',
  NULL
FROM "fee_charges" c
JOIN "organizations" o ON o."id" = c."organization_id"
WHERE o."slug" = 'demo' AND c."paid_cents" = 0
  AND (c."period_label" = 'Septiembre 2026' OR (abs(('x' || substr(md5(c."id"::text), 9, 8))::bit(32)::int) % 10) < 7)
  AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."charge_id" = c."id");

UPDATE "fee_charges" c
SET "paid_cents" = s."total", "status" = CASE WHEN s."total" >= c."amount_cents" THEN 'paid' ELSE c."status" END
FROM (SELECT p."charge_id", SUM(p."amount_cents") AS "total" FROM "payments" p GROUP BY p."charge_id") s
WHERE s."charge_id" = c."id" AND c."paid_cents" <> s."total";

UPDATE "fee_charges" c
SET "status" = 'overdue'
FROM "organizations" o
WHERE o."slug" = 'demo' AND c."organization_id" = o."id" AND c."status" = 'pending' AND c."due_on" < CURRENT_DATE;
