"use client";

import {
  OrganizationBrandingSchema,
  OrganizationUpdateResponseSchema,
  type PlatformOrganizationUpdate,
} from "@sportsmanager/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/alert";
import { AppShell } from "@/components/app-shell";
import { BrandForm } from "@/components/brand-form";
import { useBranding } from "@/components/branding-provider";
import { apiFetch, uploadFile } from "@/lib/api";

/** Ajustes del club del host: nombre, idioma, colores y logo. Permiso `org.settings.write`. */
export default function SettingsPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const branding = useBranding();
  return (
    <AppShell>
      {({ org }) => {
        if (
          !org.actor.permissions.includes("org.settings.write") ||
          org.organization.view !== "full"
        ) {
          return <Alert kind="error">{t("forbidden")}</Alert>;
        }
        const o = org.organization;
        return (
          <BrandForm
            key={o.id}
            initial={{
              name: o.name,
              defaultLocale: o.defaultLocale,
              brandPrimaryColor: o.brandPrimaryColor,
              brandSecondaryColor: o.brandSecondaryColor,
              status: o.status,
            }}
            logoUrl={branding?.logoUrl ?? o.logoUrl}
            save={async (patch: PlatformOrganizationUpdate) => {
              const { status: _status, ...rest } = patch;
              await apiFetch("/api/org", {
                method: "PATCH",
                body: rest,
                schema: OrganizationUpdateResponseSchema,
              });
              router.refresh();
            }}
            uploadLogo={async (file) => {
              const updated = await uploadFile("/api/org/logo", file, OrganizationBrandingSchema);
              router.refresh();
              return updated.logoUrl;
            }}
            removeLogo={async () => {
              await apiFetch("/api/org/logo", {
                method: "DELETE",
                schema: OrganizationBrandingSchema,
              });
              router.refresh();
            }}
          />
        );
      }}
    </AppShell>
  );
}
