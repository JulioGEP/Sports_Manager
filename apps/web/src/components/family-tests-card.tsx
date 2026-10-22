import { FamilyTestsResponseSchema } from "@sportsmanager/shared";
import { useQuery } from "@tanstack/react-query";
import { EvolutionLine } from "@/components/training-ui";
import { apiFetch } from "@/lib/api";
import { useReadyClub } from "@/lib/club";
import { useT } from "@/lib/intl";
import { Card } from "@/ui";

/**
 * Tests físicos de uno de los suyos, para la familia (ADR 0038, DESIGN.md 10): la evolución de
 * cada prueba, siempre comparada consigo mismo y nunca con el equipo. Sin resultados no se pinta.
 */
export function FamilyTestsCard({ playerId }: { playerId: string }) {
  const t = useT("familyTests");
  const u = useT("testUnits");
  const { slug } = useReadyClub();
  const query = useQuery({
    queryKey: ["org", slug, "family", playerId, "physical-tests"],
    queryFn: () =>
      apiFetch(`/api/org/family/players/${playerId}/physical-tests`, {
        schema: FamilyTestsResponseSchema,
      }),
    retry: false,
  });
  if (!query.data || query.data.results.length === 0) return null;
  const { tests, results } = query.data;
  const series = tests
    .map((test) => ({
      test,
      points: results
        .filter((r) => r.testId === test.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, value: r.value })),
    }))
    .filter((s) => s.points.length > 0);
  if (series.length === 0) return null;

  return (
    <Card title={t("title")} description={t("description")}>
      <ul className="grid gap-5 sm:grid-cols-2">
        {series.map(({ test, points }) => {
          const unit = u(test.unit);
          const last = points.at(-1);
          return (
            <li key={test.id} className="flex flex-col gap-1">
              <span className="text-body font-medium text-ink">{test.name}</span>
              <span className="text-secondary text-muted">
                {test.direction === "lower_better" ? t("lowerBetter") : t("higherBetter")}
              </span>
              <EvolutionLine
                points={points}
                lowerBetter={test.direction === "lower_better"}
                unit={unit}
                summary={t("summary", {
                  test: test.name,
                  count: points.length,
                  value: last ? `${last.value} ${unit}` : "—",
                })}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
