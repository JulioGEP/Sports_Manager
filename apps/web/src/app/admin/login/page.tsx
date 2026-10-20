import { Suspense } from "react";
import { PlatformLoginForm } from "@/components/platform/login-form";

export default function PlatformLoginPage() {
  return (
    <Suspense>
      <PlatformLoginForm />
    </Suspense>
  );
}
