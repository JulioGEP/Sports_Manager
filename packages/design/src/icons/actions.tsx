import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Camera,
  Coins,
  Copy,
  Eye,
  EyeSlash,
  FlagCheckered,
  FloppyDisk,
  Gear,
  LinkBreak,
  LinkSimple,
  PaperPlaneTilt,
  Play,
  Plus,
  Prohibit,
  SignIn,
  SignOut,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash,
  UploadSimple,
  UserMinus,
  UserPlus,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react";

/**
 * Catálogo de iconos de acción (DESIGN.md, sección 8.1).
 * Toda acción reconocible lleva su icono, y siempre el mismo en toda la app: una rueda dentada es
 * editar, un cubo de basura es eliminar, un más es añadir. El icono hereda el color del botón, así que
 * en la variante `danger` sale rojo sin configurar nada.
 * Si una acción nueva se repite en varias pantallas, entra aquí. No se elige un icono suelto en la
 * pantalla: se amplía el catálogo y se documenta en DESIGN.md.
 */
export const actionIcons = {
  /** Añadir, Nuevo, Crear, Dar de alta. */
  add: Plus,
  /** Añadir a alguien a un equipo o a un grupo. */
  addPerson: UserPlus,
  /** Invitar a alguien al club. */
  invite: UserPlus,
  /** Editar, Renombrar, Fijar, Roles. */
  edit: Gear,
  /** Eliminar, Quitar, Borrar, Revocar, Retirar. Siempre en `danger`: cubo de basura en rojo. */
  delete: Trash,
  /** Dar de baja a una persona (reversible). */
  deactivate: UserMinus,
  /** Archivar (reversible). */
  archive: Archive,
  /** Recuperar, Restaurar, Reactivar. */
  restore: ArrowCounterClockwise,
  /** Guardar. */
  save: FloppyDisk,
  /** Enviar, Reenviar. */
  send: PaperPlaneTilt,
  /** Copiar. */
  copy: Copy,
  /** Vincular. */
  link: LinkSimple,
  /** Desvincular. */
  unlink: LinkBreak,
  /** Pagar, Cobrar, Registrar un pago. */
  pay: Coins,
  /** Aprobar, Validar. */
  approve: ThumbsUp,
  /** Rechazar. */
  reject: ThumbsDown,
  /** Activar. */
  activate: Play,
  /** Cerrar o terminar algo con resultado: un reto, una temporada. */
  finish: FlagCheckered,
  /** Suspender, Anular (reversible). */
  suspend: Prohibit,
  /** Cambiar o hacer una foto. */
  photo: Camera,
  /** Subir un archivo. */
  upload: UploadSimple,
  /** Mostrar, Ver (algo oculto). */
  show: Eye,
  /** Ocultar. */
  hide: EyeSlash,
  /** Volver. */
  back: ArrowLeft,
  /** Abrir, Ver, Ir, Entrar en algo. El icono va detrás del verbo: señala hacia dónde se va. */
  open: ArrowRight,
  /** Iniciar sesión, Entrar en la cuenta, Unirse. */
  signIn: SignIn,
  /** Cerrar sesión. */
  signOut: SignOut,
  /** Hacer actual, marcar como la temporada o el plan en vigor. */
  current: Star,
} satisfies Record<string, Icon>;

export type ActionKind = keyof typeof actionIcons;

/** Acciones cuyo icono va detrás del verbo porque señalan un destino. */
export const trailingActions: ReadonlySet<ActionKind> = new Set<ActionKind>(["open"]);

export type ActionIconProps = Omit<IconProps, "ref"> & { action: ActionKind };

/** Icono de una acción del catálogo. Decorativo: el verbo del botón ya dice qué hace. */
export function ActionIcon({ action, size = 18, ...rest }: ActionIconProps) {
  const Component = actionIcons[action];
  return <Component size={size} aria-hidden="true" {...rest} />;
}
