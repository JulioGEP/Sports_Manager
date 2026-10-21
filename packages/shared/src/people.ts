import { z } from "zod";
import { DateOnlySchema, PersonGenderSchema } from "./structure.ts";
import { EmailSchema } from "./users.ts";

/**
 * Personas y socios (Bloque 14). Una persona es un registro por persona física del club; ser
 * socio, deportista, familiar o personal son papeles de esa persona. Un padre socio con un
 * hijo jugador es una persona con cuenta y otra persona (el hijo) sin ella.
 */

export const PERSON_STATUSES = ["active", "inactive"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

const ShortName = z.string().trim().min(1).max(60);
const LastName = z.string().trim().min(1).max(80);
const Phone = z.string().trim().max(30);
const NationalId = z.string().trim().max(20);
const Notes = z.string().trim().max(1000);

export const PersonCreateSchema = z.object({
  firstName: ShortName,
  lastName: LastName,
  birthDate: DateOnlySchema.nullable().optional(),
  gender: PersonGenderSchema.nullable().optional(),
  email: EmailSchema.nullable().optional(),
  phone: Phone.nullable().optional(),
  nationalId: NationalId.nullable().optional(),
  notes: Notes.nullable().optional(),
});
export type PersonCreate = z.infer<typeof PersonCreateSchema>;

export const PersonUpdateSchema = z.object({
  firstName: ShortName.optional(),
  lastName: LastName.optional(),
  birthDate: DateOnlySchema.nullable().optional(),
  gender: PersonGenderSchema.nullable().optional(),
  email: EmailSchema.nullable().optional(),
  phone: Phone.nullable().optional(),
  nationalId: NationalId.nullable().optional(),
  notes: Notes.nullable().optional(),
  status: z.enum(PERSON_STATUSES).optional(),
});
export type PersonUpdate = z.infer<typeof PersonUpdateSchema>;

// --- Tipos de socio ---

export const MEMBER_TYPE_STATUSES = ["active", "archived"] as const;
export type MemberTypeStatus = (typeof MEMBER_TYPE_STATUSES)[number];
export const MemberTypeCreateSchema = z.object({ name: ShortName });
export type MemberTypeCreate = z.infer<typeof MemberTypeCreateSchema>;
export const MemberTypeUpdateSchema = z.object({
  name: ShortName.optional(),
  status: z.enum(MEMBER_TYPE_STATUSES).optional(),
});
export type MemberTypeUpdate = z.infer<typeof MemberTypeUpdateSchema>;

// --- Socios ---

/** Al día, pendiente de completar el alta, suspendido o de baja. La baja no borra el historial. */
export const CLUB_MEMBER_STATUSES = ["active", "pending", "suspended", "left"] as const;
export type ClubMemberStatus = (typeof CLUB_MEMBER_STATUSES)[number];
export const ClubMemberStatusSchema = z.enum(CLUB_MEMBER_STATUSES);

/** Alta de socio: de una persona que ya existe (un familiar, un deportista adulto) o de una nueva. */
export const ClubMemberCreateSchema = z
  .object({
    personId: z.string().uuid().optional(),
    person: PersonCreateSchema.optional(),
    memberTypeId: z.string().uuid().nullable().optional(),
    /** Sin número, el club asigna el siguiente. */
    memberNumber: z.number().int().min(1).max(999_999).optional(),
    joinedOn: DateOnlySchema.optional(),
    status: ClubMemberStatusSchema.optional(),
  })
  .refine((m) => Boolean(m.personId) !== Boolean(m.person), {
    message: "Indica una persona existente o los datos de una nueva, no las dos cosas.",
    path: ["personId"],
  });
export type ClubMemberCreate = z.infer<typeof ClubMemberCreateSchema>;

export const ClubMemberUpdateSchema = z.object({
  memberTypeId: z.string().uuid().nullable().optional(),
  memberNumber: z.number().int().min(1).max(999_999).optional(),
  joinedOn: DateOnlySchema.optional(),
  leftOn: DateOnlySchema.nullable().optional(),
  status: ClubMemberStatusSchema.optional(),
});
export type ClubMemberUpdate = z.infer<typeof ClubMemberUpdateSchema>;

/** Nombre para mostrar de una persona. */
export function personDisplayName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
