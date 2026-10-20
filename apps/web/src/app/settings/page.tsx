"use client";

import { Suspense } from "react";
import { Settings } from "@/components/club/settings";
import { ClubShell } from "@/layouts/club-shell";

export default function SettingsPage() {
  return (
    <ClubShell>
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </ClubShell>
  );
}
