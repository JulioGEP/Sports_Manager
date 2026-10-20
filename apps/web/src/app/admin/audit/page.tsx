"use client";

import { PlatformAudit } from "@/components/platform/audit";
import { PlatformShell } from "@/layouts/platform-shell";

export default function AdminAuditPage() {
  return (
    <PlatformShell>
      <PlatformAudit />
    </PlatformShell>
  );
}
