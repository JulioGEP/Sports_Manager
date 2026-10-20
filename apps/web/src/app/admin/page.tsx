"use client";

import { PlatformClubs } from "@/components/platform/clubs";
import { PlatformShell } from "@/layouts/platform-shell";

export default function AdminPage() {
  return (
    <PlatformShell>
      <PlatformClubs />
    </PlatformShell>
  );
}
