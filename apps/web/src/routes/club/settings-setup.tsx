import { useState } from "react";
import { useNavigate } from "react-router";
import { useT } from "@/lib/intl";
import { useSetup, useSetupTour, type SetupStep, type SetupStepKey } from "@/lib/setup";
import { Button, ButtonLink, Card, Icon, StatusChip, Tour, type TourStep } from "@/ui";

// --- Puesta en marcha (antes "primeros pasos" en la portada; en General desde la ADR 0045) ---

/** Qué dice cada paso y su botón. */
function useStepTexts(): Record<SetupStepKey, { label: string; action: string }> {
  const t = useT("settings.setup");
  const text = (key: SetupStepKey) => ({ label: t(key), action: t(`${key}Action`) });
  return {
    logo: text("logo"),
    colors: text("colors"),
    season: text("season"),
    section: text("section"),
    invite: text("invite"),
  };
}

/**
 * Lo que le falta al club para estar listo, a la entrada de los ajustes. No es un ajuste: es una
 * guía que lleva a cada sitio. Mientras carga no se pinta (no se ve un paso a medias que ya está
 * hecho) y, con todo hecho, se va. En un club por estrenar abre solo el recorrido (ADR 0059), que
 * también se puede volver a ver.
 */
export function SetupCard() {
  const t = useT("settings.setup");
  const tt = useT("settings.tour");
  const texts = useStepTexts();
  const { steps, done, loading } = useSetup();
  const tour = useSetupTour();
  const [replay, setReplay] = useState(false);
  if (loading || done === steps.length) return null;

  function closeTour() {
    setReplay(false);
    tour.markSeen();
  }

  return (
    <div data-tour="setup">
      <Card
        title={t("title")}
        description={t("description", { done, total: steps.length })}
        actions={
          <Button variant="secondary" size="sm" action="show" onClick={() => setReplay(true)}>
            {tt("replay")}
          </Button>
        }
        padded={false}
      >
        <ol className="flex flex-col divide-y divide-line">
          {steps.map((step) => (
            <li
              key={step.key}
              data-tour={`setup-${step.key}`}
              className="flex min-h-16 items-center gap-3 px-5 py-3"
            >
              <span
                aria-hidden="true"
                className={`grid size-7 shrink-0 place-items-center rounded-full ${
                  step.done ? "bg-success-soft text-success" : "border border-control text-muted"
                }`}
              >
                {step.done ? <Icon.Check size={16} weight="bold" /> : null}
              </span>
              <span
                className={`flex-1 text-body ${step.done ? "text-muted line-through" : "text-ink"}`}
              >
                {texts[step.key].label}
              </span>
              {step.done ? (
                <StatusChip kind="success">{t("done")}</StatusChip>
              ) : (
                <ButtonLink action={step.icon} to={step.to} variant="secondary" size="sm">
                  {texts[step.key].action}
                </ButtonLink>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <SetupTour open={tour.pending === true || replay} steps={steps} onClose={closeTour} />
    </div>
  );
}

/**
 * Recorrido de la puesta en marcha (ADR 0059): la tarjeta, cada paso con para qué sirve, las
 * pestañas, las áreas y la paleta. Acaba en el primer paso pendiente y su botón lleva a hacerlo.
 */
function SetupTour({
  open,
  steps,
  onClose,
}: {
  open: boolean;
  steps: SetupStep[];
  onClose: () => void;
}) {
  const t = useT("settings.tour");
  const texts = useStepTexts();
  const navigate = useNavigate();
  const first = steps.find((s) => !s.done) ?? steps[0];
  if (!first) return null;
  const tourSteps: TourStep[] = [
    {
      target: '[data-tour="setup"]',
      title: t("start.title", { total: steps.length }),
      body: t("start.body"),
    },
    ...steps.map((s) => ({
      target: `[data-tour="setup-${s.key}"]`,
      title: t(`${s.key}.title`),
      body: t(`${s.key}.body`),
    })),
    { target: '[data-tour="settings-tabs"]', title: t("tabs.title"), body: t("tabs.body") },
    { target: '[data-tour="nav"]', title: t("nav.title"), body: t("nav.body") },
    { target: '[data-tour="palette"]', title: t("palette.title"), body: t("palette.body") },
    {
      target: `[data-tour="setup-${first.key}"]`,
      title: t("end.title"),
      body: t("end.body", { step: texts[first.key].label }),
    },
  ];

  return (
    <Tour
      open={open}
      steps={tourSteps}
      onClose={onClose}
      onFinish={() => {
        onClose();
        void navigate(first.to);
      }}
      labels={{
        progress: (step, total) => t("progress", { step, total }),
        next: t("next"),
        back: t("back"),
        skip: t("skip"),
        close: t("close"),
        finish: texts[first.key].action,
      }}
      finishAction={first.icon}
    />
  );
}
