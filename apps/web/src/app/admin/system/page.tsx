"use client";

import { useTranslations } from "next-intl";
import { ApiStatus } from "@/components/api-status";
import { PlatformShell } from "@/layouts/platform-shell";
import { Card, PageHeader } from "@/ui";

export default function AdminSystemPage() {
  const t = useTranslations("platform.system");
  return (
    <PlatformShell>
      <PageHeader title={t("title")} description={t("description")} />
      <Card title={t("apiTitle")}>
        <ApiStatus />
      </Card>
    </PlatformShell>
  );
}
