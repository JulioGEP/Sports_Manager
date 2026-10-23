import { DeveloperSettingsResponseSchema, PUBLIC_KEY_HEADER } from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Definitions,
  Icon,
  Segmented,
  StatusChip,
  useToast,
} from "@/ui";

type Snippet = "html" | "js" | "curl";

/** Código listo para pegar en la web del club: pinta los productos con su foto, precio y enlace. */
function htmlSnippet(apiBase: string, key: string, soldOut: string): string {
  return `<div id="club-store"></div>
<script>
  (async () => {
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
    const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
    const res = await fetch("${apiBase}/catalog?key=${key}");
    const { products } = await res.json();
    document.getElementById("club-store").innerHTML = products
      .map((p) => \`
        <a href="\${esc(p.buyUrl)}" style="display:inline-block;width:200px;margin:8px;color:inherit;text-decoration:none">
          \${p.imageUrl ? \`<img src="\${esc(p.imageUrl)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px">\` : ""}
          <strong>\${esc(p.name)}</strong><br>
          \${euro.format(p.priceCents / 100)}\${p.inStock ? "" : " · ${soldOut}"}
        </a>\`)
      .join("");
  })();
</script>`;
}

function jsSnippet(apiBase: string, key: string): string {
  return `const res = await fetch("${apiBase}/catalog", {
  headers: { "${PUBLIC_KEY_HEADER}": "${key}" },
});
const { club, products } = await res.json();
// products: [{ id, name, description, category, priceCents, currency, imageUrl,
//              availableUntil, inStock, options: [{ id, label, inStock }], buyUrl }]`;
}

function curlSnippet(apiBase: string, key: string): string {
  return `curl -H "${PUBLIC_KEY_HEADER}: ${key}" ${apiBase}/catalog`;
}

/**
 * Desarrolladores (ADR 0041): la web del club enseña los productos públicos de su tienda con una
 * clave publicable. Se activa, se cambia y se apaga desde aquí; el código para pegar va incluido.
 */
export function DevelopersTab() {
  const t = useT("settings.developers");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [snippet, setSnippet] = useState<Snippet>("html");
  const [confirm, setConfirm] = useState<"rotate" | "disable" | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const query = useQuery({
    queryKey: ["org", slug, "store", "developer"],
    queryFn: () =>
      apiFetch("/api/org/store/developer", { schema: DeveloperSettingsResponseSchema }),
  });

  if (query.isPending) return <p className="text-body text-muted">{c("loading")}</p>;
  if (query.isError || !query.data)
    return <Alert kind="error">{errors(errorKey(query.error))}</Alert>;
  const dev = query.data.developer;
  const key = dev.publicKey;

  async function change(method: "POST" | "DELETE") {
    setConfirm(null);
    setBusy(true);
    setTest(null);
    try {
      const res = await apiFetch("/api/org/store/developer/key", {
        method,
        schema: DeveloperSettingsResponseSchema,
      });
      client.setQueryData(["org", slug, "store", "developer"], res);
      toast("success", method === "DELETE" ? t("disabled") : key ? t("rotated") : t("enabled"));
    } catch (err) {
      toast("error", errors(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied(null);
    }
  }

  /** Llama a la API pública como lo haría la web del club: sin cookies ni cabecera de club. */
  async function tryIt() {
    if (!key) return;
    try {
      const res = await fetch(`${dev.apiBase}/catalog?key=${key}`, { credentials: "omit" });
      const body = (await res.json()) as { products?: { name: string }[] };
      setTest(
        res.ok
          ? {
              ok: true,
              text: t("testOk", {
                count: body.products?.length ?? 0,
                names: (body.products ?? [])
                  .slice(0, 5)
                  .map((p) => p.name)
                  .join(", "),
              }),
            }
          : { ok: false, text: t("testFail", { status: res.status }) },
      );
    } catch {
      setTest({ ok: false, text: t("testFail", { status: 0 }) });
    }
  }

  const code = key
    ? snippet === "html"
      ? htmlSnippet(dev.apiBase, key, t("soldOut"))
      : snippet === "js"
        ? jsSnippet(dev.apiBase, key)
        : curlSnippet(dev.apiBase, key)
    : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t("title")}
          description={t("description")}
          footer={
            key ? (
              <>
                <Button variant="secondary" action="hide" onClick={() => setConfirm("disable")}>
                  {t("disable")}
                </Button>
                <Button
                  variant="secondary"
                  action="restore"
                  loading={busy}
                  onClick={() => setConfirm("rotate")}
                >
                  {t("rotate")}
                </Button>
              </>
            ) : (
              <Button action="activate" loading={busy} onClick={() => void change("POST")}>
                {t("enable")}
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-4">
            <Definitions
              items={[
                {
                  term: t("status"),
                  detail: (
                    <StatusChip kind={key ? "success" : "neutral"}>
                      {key ? t("on") : t("off")}
                    </StatusChip>
                  ),
                },
                {
                  term: t("publicProducts"),
                  detail: t("publicProductsCount", { count: dev.publicProducts }),
                },
              ]}
            />
            {key ? (
              <div className="flex flex-col gap-2">
                <span className="text-secondary font-medium text-ink">{t("key")}</span>
                <div className="flex flex-wrap items-center gap-3 rounded-field border border-dashed border-control bg-surface p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-secondary text-ink">
                    {key}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    action="copy"
                    onClick={() => void copy(key, "key")}
                  >
                    {copied === "key" ? t("copied") : t("copy")}
                  </Button>
                </div>
                <p className="text-label text-muted">{t("keyHint")}</p>
              </div>
            ) : null}
            {dev.publicProducts === 0 ? <Alert kind="info">{t("noPublicProducts")}</Alert> : null}
            <ButtonLink
              action="open"
              to={`${paths.store}?tab=products`}
              variant="tertiary"
              size="sm"
            >
              {t("manageProducts")}
            </ButtonLink>
          </div>
        </Card>
        <Card title={t("endpointsTitle")} description={t("endpointsDescription")}>
          <ul className="flex flex-col gap-3">
            <li className="flex flex-col gap-1">
              <code className="break-all font-mono text-secondary text-ink">
                GET {dev.apiBase}/catalog
              </code>
              <span className="text-label text-muted">{t("endpointCatalog")}</span>
            </li>
            <li className="flex flex-col gap-1">
              <code className="break-all font-mono text-secondary text-ink">
                GET {dev.apiBase}/catalog/products/{"{id}"}
              </code>
              <span className="text-label text-muted">{t("endpointProduct")}</span>
            </li>
          </ul>
          <p className="mt-4 text-secondary text-muted">
            {t("auth", { header: PUBLIC_KEY_HEADER })}
          </p>
          <p className="mt-2 text-secondary text-muted">{t("buying")}</p>
          <div className="mt-4">
            <ButtonLink
              external
              to="/api/docs"
              variant="tertiary"
              size="sm"
              icon={<Icon.ArrowSquareOut size={16} aria-hidden="true" />}
            >
              {t("docs")}
            </ButtonLink>
          </div>
        </Card>
      </div>
      {key ? (
        <Card
          title={t("snippetsTitle")}
          description={t("snippetsDescription")}
          actions={
            <Segmented<Snippet>
              label={t("snippetsTitle")}
              value={snippet}
              onChange={setSnippet}
              options={[
                { key: "html", label: t("snippet.html") },
                { key: "js", label: t("snippet.js") },
                { key: "curl", label: t("snippet.curl") },
              ]}
            />
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-secondary text-muted">{t(`snippetHint.${snippet}`)}</p>
            <pre className="max-h-96 overflow-auto rounded-field bg-raised p-4 font-mono text-label text-ink">
              <code>{code}</code>
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                action="copy"
                onClick={() => void copy(code, "code")}
              >
                {copied === "code" ? t("copied") : t("copyCode")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Icon.Play size={16} aria-hidden="true" />}
                onClick={() => void tryIt()}
              >
                {t("test")}
              </Button>
            </div>
            {test ? <Alert kind={test.ok ? "success" : "error"}>{test.text}</Alert> : null}
          </div>
        </Card>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "disable" ? t("confirmDisableTitle") : t("confirmRotateTitle")}
        body={confirm === "disable" ? t("confirmDisableBody") : t("confirmRotateBody")}
        confirmLabel={confirm === "disable" ? t("disable") : t("rotate")}
        confirmAction={confirm === "disable" ? "hide" : "restore"}
        cancelLabel={c("cancel")}
        onConfirm={() => void change(confirm === "disable" ? "DELETE" : "POST")}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
