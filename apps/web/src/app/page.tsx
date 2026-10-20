import { getTranslations } from "next-intl/server";
import { ApiStatus } from "@/components/api-status";

export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <main className="page">
      <section className="card">
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
      </section>
      <section className="card">
        <h2>{t("apiStatus")}</h2>
        <ApiStatus />
      </section>
    </main>
  );
}
