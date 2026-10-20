"use client";

import { useParams } from "next/navigation";
import { PlatformClub } from "@/components/platform/club";
import { PlatformShell } from "@/layouts/platform-shell";

export default function AdminOrganizationPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <PlatformShell>
      <PlatformClub slug={slug} />
    </PlatformShell>
  );
}
