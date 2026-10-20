"use client";

import { useBranding } from "@/components/branding-provider";
import { ClubHome } from "@/components/club/home";
import { Landing } from "@/components/landing";
import { ClubShell } from "@/layouts/club-shell";

export default function HomePage() {
  const branding = useBranding();
  if (!branding) return <Landing />;
  return (
    <ClubShell>
      <ClubHome />
    </ClubShell>
  );
}
