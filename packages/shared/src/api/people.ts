import { z } from "zod";
import { CLUB_MEMBER_STATUSES, MEMBER_TYPE_STATUSES, PERSON_STATUSES } from "../people.ts";
import { PERSON_GENDERS } from "../structure.ts";

/** Contratos de personas y socios (Bloque 14). Datos personales: solo con `org.club_members.read`. */

export const PersonSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  gender: z.enum(PERSON_GENDERS).nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  photoUrl: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(PERSON_STATUSES),
  /** Cuenta vinculada, si la persona entra en la app. */
  userId: z.string().nullable(),
  createdAt: z.string(),
});
export type Person = z.infer<typeof PersonSchema>;

export const MemberTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(MEMBER_TYPE_STATUSES),
  sortOrder: z.number().int(),
  membersCount: z.number().int().nonnegative(),
});
export type MemberType = z.infer<typeof MemberTypeSchema>;
export const MemberTypesResponseSchema = z.object({ memberTypes: z.array(MemberTypeSchema) });
export type MemberTypesResponse = z.infer<typeof MemberTypesResponseSchema>;
export const MemberTypeResponseSchema = z.object({ memberType: MemberTypeSchema });

/** Un socio en la lista: su persona, número, tipo, estado y lo que debe. */
export const ClubMemberSchema = z.object({
  id: z.string(),
  memberNumber: z.number().int(),
  status: z.enum(CLUB_MEMBER_STATUSES),
  joinedOn: z.string(),
  leftOn: z.string().nullable(),
  memberType: z.object({ id: z.string(), name: z.string() }).nullable(),
  person: PersonSchema,
  /** Papeles de la persona en el club, para la tarjeta. */
  roles: z.object({
    player: z.object({ id: z.string() }).nullable(),
    guardianOf: z.array(z.object({ playerId: z.string(), name: z.string() })),
    staff: z.boolean(),
  }),
  /** Cuotas pendientes de la persona (Bloque 18): nulo sin `org.fees.read`. */
  fees: z
    .object({ pendingCents: z.number().int().nonnegative(), overdueCount: z.number().int() })
    .nullable(),
});
export type ClubMember = z.infer<typeof ClubMemberSchema>;
export const ClubMembersResponseSchema = z.object({ members: z.array(ClubMemberSchema) });
export type ClubMembersResponse = z.infer<typeof ClubMembersResponseSchema>;
export const ClubMemberResponseSchema = z.object({ member: ClubMemberSchema });
export type ClubMemberResponse = z.infer<typeof ClubMemberResponseSchema>;

/** Búsqueda de personas para dar de alta como socio o deportista a alguien que ya existe. */
export const PeopleResponseSchema = z.object({
  people: z.array(
    PersonSchema.extend({
      isMember: z.boolean(),
      isPlayer: z.boolean(),
    }),
  ),
});
export type PeopleResponse = z.infer<typeof PeopleResponseSchema>;
export const PersonResponseSchema = z.object({ person: PersonSchema });
