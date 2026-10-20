"use client";

import { Suspense } from "react";
import { Members } from "@/components/club/members";
import { ClubShell } from "@/layouts/club-shell";

export default function MembersPage() {
  return (
    <ClubShell>
      <Suspense fallback={null}>
        <Members />
      </Suspense>
    </ClubShell>
  );
}
