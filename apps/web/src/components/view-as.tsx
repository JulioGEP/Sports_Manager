import { MembersResponseSchema, type RoleCode } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { apiFetch } from "@/lib/api";
import { clubPaths, useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Alert, Avatar, Button, EmptyState, Icon, Input, Sheet, StatusChip } from "@/ui";

const ORDER: RoleCode[] = ["coach", "staff", "guardian", "org_admin"];

/**
 * "Ver como" (Bloque 14): la administración elige a una persona del club y la web pasa a pedirlo
 * todo con sus ojos (la API resuelve sus permisos, sus equipos y su familia). La sesión no cambia:
 * salir del modo es un toque.
 */
export function ViewAsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT("viewAs");
  const roles = useT("roles");
  const positions = useT("positions");
  const c = useT("common");
  const navigate = useNavigate();
  const { slug, setViewAs, me } = useReadyClub();
  const [query, setQuery] = useState("");
  const members = useQuery({
    queryKey: ["org", slug, "members"],
    queryFn: () => apiFetch("/api/org/members", { schema: MembersResponseSchema }),
    enabled: open,
  });
  const q = query.trim().toLowerCase();
  const candidates = (members.data?.members ?? [])
    .filter((m) => m.userId !== me.user.id)
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.roles[0] ?? "guardian") - ORDER.indexOf(b.roles[0] ?? "guardian") ||
        a.name.localeCompare(b.name),
    );

  async function choose(userId: string) {
    await setViewAs(userId);
    onClose();
    void navigate(clubPaths(slug).home);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={c("close")}
      title={t("title")}
      description={t("description")}
    >
      <div className="flex flex-col gap-4">
        <Input
          type="search"
          placeholder={t("search")}
          aria-label={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {members.isError ? <Alert kind="error">{t("error")}</Alert> : null}
        {members.data && candidates.length === 0 ? (
          <EmptyState icon={<Icon.Eye weight="duotone" />} title={t("empty")} />
        ) : null}
        <ul className="flex flex-col divide-y divide-line">
          {candidates.map((m) => (
            <li key={m.userId}>
              <button
                type="button"
                onClick={() => void choose(m.userId)}
                className="flex min-h-16 w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-raised"
              >
                <Avatar name={m.name} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium text-ink">{m.name}</span>
                  <span className="truncate text-secondary text-muted">
                    {m.teams.length > 0 ? m.teams.map((x) => x.teamName).join(", ") : m.email}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {m.roles.map((r) => (
                    <StatusChip key={r} kind="club">
                      {r === "staff" && m.position ? positions(m.position) : roles(r)}
                    </StatusChip>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/** Aviso fijo mientras se mira el club como otra persona, con la salida a un toque. */
export function ViewAsBanner() {
  const t = useT("viewAs");
  const roles = useT("roles");
  const navigate = useNavigate();
  const { org, slug, setViewAs } = useReadyClub();
  if (org.actor.kind !== "member" || !org.actor.viewingAs) return null;
  const { name, roles: viewedRoles } = org.actor.viewingAs;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning bg-warning-soft px-4 py-3 text-body text-ink"
    >
      <span className="flex items-center gap-2">
        <Icon.Eye size={20} weight="duotone" aria-hidden="true" />
        <span>{t("banner", { name, role: viewedRoles.map((r) => roles(r)).join(", ") })}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          void setViewAs(null).then(() => navigate(clubPaths(slug).home));
        }}
      >
        {t("exit")}
      </Button>
    </div>
  );
}
