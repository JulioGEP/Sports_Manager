"use client";

import {
  LOCALES,
  OrganizationCreateSchema,
  PlatformOrganizationResponseSchema,
  PlatformOrganizationsResponseSchema,
  SportsResponseSchema,
  slugify,
  type Locale,
  type PlatformOrganization,
  type SportsResponse,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  initials,
  useToast,
  type BadgeTone,
} from "@/ui";

export const statusTone: Record<PlatformOrganization["status"], BadgeTone> = {
  active: "success",
  suspended: "warning",
  archived: "neutral",
};

export function PlatformClubs() {
  const t = useTranslations("platform.clubs");
  const c = useTranslations("common");
  const statuses = useTranslations("status");
  const errors = useTranslations("errors");
  const format = useFormatter();
  const [organizations, setOrganizations] = useState<PlatformOrganization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch("/api/platform/organizations", {
        schema: PlatformOrganizationsResponseSchema,
      });
      setOrganizations(res.organizations);
    } catch (err) {
      setError(errors(errorKey(err)));
    }
  }, [errors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="stack">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button icon={<Icon.Plus size={18} />} onClick={() => setCreateOpen(true)}>
            {t("create")}
          </Button>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <Alert kind="info">{t("domainNote")}</Alert>
      <div className="card">
        <DataTable<PlatformOrganization>
          caption={t("title")}
          rows={organizations ?? []}
          getKey={(o) => o.id}
          empty={
            <EmptyState
              icon={<Icon.Building />}
              title={organizations === null ? c("loading") : t("empty")}
            />
          }
          columns={[
            {
              key: "club",
              header: t("table.club"),
              cell: (o) => (
                <span className="cell-person">
                  <span
                    className="club-card__swatch"
                    style={{ background: o.brandPrimaryColor, width: 36, height: 36 }}
                  >
                    {o.logoUrl ? (
                      <img src={o.logoUrl} alt="" />
                    ) : (
                      <span className="brand-mark" style={{ background: "transparent" }}>
                        {initials(o.name)}
                      </span>
                    )}
                  </span>
                  <span>
                    <Link className="rowlink" href={`/admin/${o.slug}`}>
                      {o.name}
                    </Link>
                    <br />
                    <span className="cell-person__sub">{o.url.replace(/^https?:\/\//, "")}</span>
                  </span>
                </span>
              ),
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (o) => <Badge tone={statusTone[o.status]}>{statuses(o.status)}</Badge>,
            },
            {
              key: "members",
              header: t("table.members"),
              cell: (o) => o.counts.members,
              align: "right",
            },
            {
              key: "pending",
              header: t("table.pending"),
              cell: (o) => o.counts.pendingInvitations,
              align: "right",
            },
            {
              key: "created",
              header: t("table.created"),
              cell: (o) => format.dateTime(new Date(o.createdAt), { dateStyle: "medium" }),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (o) => (
                <span className="cell-actions">
                  <Link className="btn btn--secondary btn--sm" href={`/admin/${o.slug}`}>
                    {t("manage")}
                  </Link>
                </span>
              ),
            },
          ]}
        />
      </div>
      <CreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void reload()}
      />
    </div>
  );
}

function CreateDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("platform.createDrawer");
  const c = useTranslations("common");
  const locales = useTranslations("locales");
  const errors = useTranslations("errors");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const router = useRouter();
  const [sports, setSports] = useState<SportsResponse["sports"]>([]);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    slugEdited: false,
    defaultLocale: "es" as Locale,
    defaultSportCode: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/platform/sports", { schema: SportsResponseSchema })
      .then((res) => {
        setSports(res.sports);
        setForm((f) =>
          f.defaultSportCode ? f : { ...f, defaultSportCode: res.sports[0]?.code ?? "" },
        );
      })
      .catch(() => undefined);
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = OrganizationCreateSchema.safeParse({
      name: form.name,
      slug: form.slug,
      defaultLocale: form.defaultLocale,
      defaultSportCode: form.defaultSportCode,
      brandPrimaryColor: brandTokens["--color-brand-primary"],
      brandSecondaryColor: brandTokens["--color-brand-secondary"],
    });
    if (!parsed.success) {
      setError(t("invalidSlug"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/platform/organizations", {
        method: "POST",
        body: parsed.data,
        schema: PlatformOrganizationResponseSchema,
      });
      toast("success", t("created", { name: res.organization.name }));
      setForm({
        name: "",
        slug: "",
        slugEdited: false,
        defaultLocale: "es",
        defaultSportCode: form.defaultSportCode,
      });
      onCreated();
      onClose();
      router.push(`/admin/${res.organization.slug}`);
    } catch (err) {
      setError(errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
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
            type="submit"
            form="create-club-form"
            loading={busy}
            disabled={!form.defaultSportCode}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="create-club-form" className="form" onSubmit={(e) => void submit(e)}>
        <Field label={t("name")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={120}
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                  slug: form.slugEdited ? form.slug : slugify(e.target.value),
                })
              }
            />
          )}
        </Field>
        <Field label={t("slug")} hint={t("slugHint")}>
          {(id) => (
            <Input
              id={id}
              required
              maxLength={63}
              pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase(), slugEdited: true })
              }
            />
          )}
        </Field>
        <div className="form__row">
          <Field label={t("locale")}>
            {(id) => (
              <Select
                id={id}
                value={form.defaultLocale}
                onChange={(e) => setForm({ ...form, defaultLocale: e.target.value as Locale })}
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {locales(code)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("sport")}>
            {(id) => (
              <Select
                id={id}
                value={form.defaultSportCode}
                onChange={(e) => setForm({ ...form, defaultSportCode: e.target.value })}
              >
                {sports.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name[locale]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="small muted">{t("brandNote")}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Drawer>
  );
}
