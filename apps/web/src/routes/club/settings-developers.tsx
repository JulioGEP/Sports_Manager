import { DeveloperSettingsResponseSchema, PUBLIC_KEY_HEADER } from "@sportsmanager/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, errorKey } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useClubModel } from "@/lib/fitness";
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
    const euro = (cents) =>
      (cents / 100).toFixed(2).replace(".", ",").replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".") + " €";
    const res = await fetch("${apiBase}/catalog?key=${key}");
    const { products } = await res.json();
    document.getElementById("club-store").innerHTML = products
      .map((p) => \`
        <a href="\${esc(p.buyUrl)}" style="display:inline-block;width:200px;margin:8px;color:inherit;text-decoration:none">
          \${p.imageUrl ? \`<img src="\${esc(p.imageUrl)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px">\` : ""}
          <strong>\${esc(p.name)}</strong><br>
          \${euro(p.priceCents)}\${p.inStock ? "" : " · ${soldOut}"}
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
 * Para la web de un box (ADR 0049 y 0050): el horario de los próximos días con las plazas libres y
 * el formulario de la clase de prueba, que deja un lead con su consentimiento.
 */
function boxSnippet(apiBase: string, key: string, labels: Record<string, string>): string {
  return `<div id="box-classes"></div>
<form id="box-trial">
  <input name="firstName" placeholder="${labels["firstName"]}" required>
  <input name="lastName" placeholder="${labels["lastName"]}" required>
  <input name="email" type="email" placeholder="${labels["email"]}" required>
  <select name="eventId"></select>
  <label><input name="consent" type="checkbox" required> ${labels["consent"]}</label>
  <button>${labels["send"]}</button>
</form>
<script>
  (async () => {
    const api = "${apiBase}";
    const key = "${key}";
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
    const when = (iso) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const { classes } = await (await fetch(api + "/classes?days=7&key=" + key)).json();
    document.getElementById("box-classes").innerHTML = classes
      .map((c) => \`<p><strong>\${when(c.startsAt)}</strong> · \${esc(c.classType ?? c.title)}\${c.spotsLeft === null ? "" : " · " + c.spotsLeft}</p>\`)
      .join("");
    const form = document.getElementById("box-trial");
    form.eventId.innerHTML = classes
      .filter((c) => c.spotsLeft !== 0)
      .map((c) => \`<option value="\${c.id}">\${when(c.startsAt)} · \${esc(c.classType ?? c.title)}</option>\`)
      .join("");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      await fetch(api + "/trials?key=" + key, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, consent: true }),
      });
      form.replaceWith("${labels["thanks"]}");
    });
  })();
</script>`;
}

/** El horario y la clase de prueba en la web del box, con la misma clave que el catálogo. */
function BoxWebCard({ apiBase, publicKey }: { apiBase: string; publicKey: string | null }) {
  const t = useT("settings.developers.box");
  const d = useT("settings.developers");
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const [copied, setCopied] = useState(false);
  const code = publicKey
    ? boxSnippet(apiBase, publicKey, {
        firstName: t("form.firstName"),
        lastName: t("form.lastName"),
        email: t("form.email"),
        consent: t("form.consent"),
        send: t("form.send"),
        thanks: t("form.thanks"),
      })
    : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Card title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          <li className="flex flex-col gap-1">
            <code className="break-all font-mono text-secondary text-ink">
              GET {apiBase}/classes?days=7
            </code>
            <span className="text-label text-muted">{t("endpointClasses")}</span>
          </li>
          <li className="flex flex-col gap-1">
            <code className="break-all font-mono text-secondary text-ink">
              POST {apiBase}/trials
            </code>
            <span className="text-label text-muted">{t("endpointTrials")}</span>
          </li>
        </ul>
        {publicKey ? (
          <>
            <pre className="max-h-96 overflow-auto rounded-field bg-raised p-4 font-mono text-label text-ink">
              <code>{code}</code>
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" action="copy" onClick={() => void copy()}>
                {copied ? d("copied") : d("copyCode")}
              </Button>
              <ButtonLink action="open" to={paths.leads} variant="tertiary" size="sm">
                {t("leads")}
              </ButtonLink>
            </div>
          </>
        ) : (
          <Alert kind="info">{t("needsKey")}</Alert>
        )}
      </div>
    </Card>
  );
}

/**
 * Web del club (ADR 0041; antes "Desarrolladores", ADR 0045): la web del club enseña los productos
 * públicos de su tienda con una clave publicable. Se activa, se cambia y se apaga desde aquí; el
 * código para pegar va incluido.
 */
export function DevelopersTab() {
  const t = useT("settings.developers");
  const c = useT("common");
  const errors = useT("errors");
  const toast = useToast();
  const client = useQueryClient();
  const { slug } = useReadyClub();
  const paths = clubPaths(slug);
  const fitness = useClubModel() === "fitness";
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
      {fitness ? <BoxWebCard apiBase={dev.apiBase} publicKey={key} /> : null}
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
