import * as Phosphor from "@phosphor-icons/react";
import type { ClubIconStyle } from "@sportsmanager/shared";
import { createContext, forwardRef, useContext, useMemo, type ReactNode } from "react";

/*
 * Estilo de iconos del club (ADR 0043). Las pantallas siguen escribiendo `weight="duotone"` donde
 * el icono decora y nada donde acompaña a un verbo; aquí se traduce al estilo que eligió el club.
 * Los pesos con significado propio (`fill` en la estrella de "actual", `bold` en un check) no se
 * tocan. Los iconos del design system (los de acción del botón) toman el peso del IconContext.
 */

type Weight = Phosphor.IconWeight;

/** Peso de cada hueco según el estilo del club: el de los iconos que decoran y el del resto. */
const WEIGHTS: Record<ClubIconStyle, { decorative: Weight; plain: Weight }> = {
  duotono: { decorative: "duotone", plain: "regular" },
  linea: { decorative: "regular", plain: "regular" },
  fina: { decorative: "light", plain: "light" },
  gruesa: { decorative: "bold", plain: "bold" },
  relleno: { decorative: "fill", plain: "fill" },
};

const DecorativeWeight = createContext<Weight>("duotone");

/** Estilo de iconos del club para todo lo que cuelga de aquí, incluidos los del design system. */
export function IconStyleProvider({
  style,
  children,
}: {
  style: ClubIconStyle;
  children: ReactNode;
}) {
  const weights = WEIGHTS[style];
  const phosphor = useMemo(() => ({ weight: weights.plain }), [weights.plain]);
  return (
    <DecorativeWeight.Provider value={weights.decorative}>
      <Phosphor.IconContext.Provider value={phosphor}>{children}</Phosphor.IconContext.Provider>
    </DecorativeWeight.Provider>
  );
}

export function themed(Base: Phosphor.Icon): Phosphor.Icon {
  const Themed = forwardRef<SVGSVGElement, Phosphor.IconProps>(function Themed(props, ref) {
    const decorative = useContext(DecorativeWeight);
    const { weight, ...rest } = props;
    // Sin peso, el del IconContext (el del club para los iconos que acompañan a un verbo).
    if (weight === undefined) return <Base ref={ref} {...rest} />;
    return <Base ref={ref} {...rest} weight={weight === "duotone" ? decorative : weight} />;
  });
  Themed.displayName = Base.displayName ?? "Icon";
  return Themed;
}
