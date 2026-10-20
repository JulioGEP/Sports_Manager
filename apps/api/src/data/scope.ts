declare const orgScopeBrand: unique symbol;

/**
 * Ámbito de organización (ADR 0015). Solo la capa de datos lo construye, a partir de una fila
 * real de `organizations` resuelta por subdominio. Ninguna petición puede fabricarlo: no es
 * un identificador que viaje en cuerpos ni parámetros. Toda consulta sobre datos de un club
 * lo exige y añade `organization_id = scope.organizationId`.
 */
export interface OrgScope {
  readonly organizationId: string;
  readonly [orgScopeBrand]: true;
}

/** Uso interno de la capa de datos. No se exporta fuera de `src/data`. */
export function mintOrgScope(organizationId: string): OrgScope {
  return { organizationId } as OrgScope;
}
