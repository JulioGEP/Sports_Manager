import {
  LOCALES,
  OrganizationCreateSchema,
  PlatformOrganizationResponseSchema,
  PlatformOrganizationsResponseSchema,
  SportsResponseSchema,
  slugify,
  type Locale,
  type PlatformOrganization,
} from "@sportsmanager/shared";
import { brandTokens } from "@sportsmanager/shared/design";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { Link, useNavigate } from "react-router";
import { apiFetch, errorKey } from "@/lib/api";
import { useLocale, useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Crest,
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

export const statusKind: Record<PlatformOrganization["status"], StatusKind> = {
  active: "success",
  suspended: "warning",
  archived: "neutral",
};

export function PlatformClubsPage() {
  const t = useT("platform.clubs");
  const c = useT("common");
  const statuses = useT("status");
  const errors = useT("errors");
  const intl = useIntl();
  const [createOpen, setCreateOpen] = useState(false);
  const organizations = useQuery({
    queryKey: ["platform", "organizations"],
    queryFn: () =>
      apiFetch("/api/platform/organizations", {
        schema: PlatformOrganizationsResponseSchema,
        club: null,
      }),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            icon={<Icon.Plus size={20} aria-hidden="true" />}
            onClick={() => setCreateOpen(true)}
          >
            {t("create")}
          </Button>
        }
      />
      {organizations.isError ? (
        <Alert kind="error">{errors(errorKey(organizations.error))}</Alert>
      ) : null}
      <Alert kind="info">{t("domainNote")}</Alert>
      <Card padded={false}>
        <DataList<PlatformOrganization>
          caption={t("title")}
          rows={organizations.data?.organizations ?? []}
          getKey={(o) => o.id}
          empty={
            <EmptyState
              icon={<Icon.Buildings weight="duotone" />}
              title={organizations.isPending ? c("loading") : t("empty")}
            />
          }
          columns={[
            {
              key: "club",
              header: t("table.club"),
              cell: (o) => (
                <span className="flex items-center gap-3">
                  <span
                    className="grid size-9 place-items-center rounded-full"
                    style={{ background: o.brandPrimaryColor }}
                  >
                    <Crest name={o.name} logoUrl={o.logoUrl} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <Link to={`/admin/clubs/${o.slug}`} className="font-medium text-ink">
                      {o.name}
                    </Link>
                    <span className="text-secondary text-muted">
                      {o.url.replace(/^https?:\/\//, "")}
                    </span>
                  </span>
                </span>
              ),
            },
            {
              key: "status",
              header: t("table.status"),
              cell: (o) => (
                <StatusChip kind={statusKind[o.status]}>{statuses(o.status)}</StatusChip>
              ),
            },
            {
              key: "members",
              header: t("table.members"),
              cell: (o) => o.counts.members,
              numeric: true,
            },
            {
              key: "pending",
              header: t("table.pending"),
              cell: (o) => o.counts.pendingInvitations,
              numeric: true,
            },
            {
              key: "created",
              header: t("table.created"),
              cell: (o) => intl.formatDate(new Date(o.createdAt), { dateStyle: "medium" }),
            },
          ]}
          mobileRow={(o) => ({
            leading: <Crest name={o.name} logoUrl={o.logoUrl} />,
            title: o.name,
            subtitle: `/${o.slug}`,
            trailing: <StatusChip kind={statusKind[o.status]}>{statuses(o.status)}</StatusChip>,
          })}
          actions={(o) => (
            <ButtonLink to={`/admin/clubs/${o.slug}`} variant="secondary" size="sm">
              {t("manage")}
            </ButtonLink>
          )}
        />
      </Card>
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT("platform.createDrawer");
  const c = useT("common");
  const locales = useT("locales");
  const errors = useT("errors");
  const { locale } = useLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const sports = useQuery({
    queryKey: ["platform", "sports"],
    queryFn: () => apiFetch("/api/platform/sports", { schema: SportsResponseSchema, club: null }),
    enabled: open,
  });
  const [form, setForm] = useState({
    name: "",
    slug: "",
    slugEdited: false,
    defaultLocale: "es" as Locale,
    defaultSportCode: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sportCode = form.defaultSportCode || sports.data?.sports[0]?.code || "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = OrganizationCreateSchema.safeParse({
      name: form.name,
      slug: form.slug,
      defaultLocale: form.defaultLocale,
      defaultSportCode: sportCode,
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
        club: null,
      });
      toast("success", t("created", { name: res.organization.name }));
      setForm({ name: "", slug: "", slugEdited: false, defaultLocale: "es", defaultSportCode: "" });
      await client.invalidateQueries({ queryKey: ["platform", "organizations"] });
      onClose();
      void navigate(`/admin/clubs/${res.organization.slug}`);
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
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {c("cancel")}
          </Button>
          <Button type="submit" form="create-club-form" loading={busy} disabled={!sportCode}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <form id="create-club-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
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
              className="font-mono"
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase(), slugEdited: true })
              }
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
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
                value={sportCode}
                onChange={(e) => setForm({ ...form, defaultSportCode: e.target.value })}
              >
                {(sports.data?.sports ?? []).map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name[locale]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <p className="text-secondary text-muted">{t("brandNote")}</p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </form>
    </Sheet>
  );
}
