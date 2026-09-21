/**
 * projectIdentityMap — the safe seam between the two project id spaces DISCOVER flagged: a
 * `delivery_projects.id` (the contract parent) and a student `projects.id` (the intern's
 * build). Both are bare UUIDs, so nothing at runtime stops one being passed where the other is
 * expected. Branded types stop it at COMPILE time, and the runtime resolution goes only through
 * the sanctioned bridge, `DeliveryProjectSourceLink`, returning null (never a guess) when there
 * is no link.
 */

// Opaque brands: a plain string cast that the compiler will not let you mix up.
export type DeliveryProjectId = string & { readonly __brand: 'DeliveryProjectId' };
export type StudentProjectId = string & { readonly __brand: 'StudentProjectId' };

export const asDeliveryProjectId = (s: string): DeliveryProjectId => s as DeliveryProjectId;
export const asStudentProjectId = (s: string): StudentProjectId => s as StudentProjectId;

/** The student build linked to a contract's delivery project, or null when none is linked. */
export async function resolveStudentProject(deliveryProjectId: DeliveryProjectId): Promise<StudentProjectId | null> {
  const { default: DeliveryProjectSourceLink } = await import('../../models/DeliveryProjectSourceLink');
  const link: any = await DeliveryProjectSourceLink.findOne({
    where: { delivery_project_id: String(deliveryProjectId) },
  });
  const sid = link?.student_project_id;
  return sid ? asStudentProjectId(String(sid)) : null;
}

/** The delivery-project parent a student build was pulled into, or null when it stands alone. */
export async function resolveDeliveryProject(studentProjectId: StudentProjectId): Promise<DeliveryProjectId | null> {
  const { default: DeliveryProjectSourceLink } = await import('../../models/DeliveryProjectSourceLink');
  const link: any = await DeliveryProjectSourceLink.findOne({
    where: { student_project_id: String(studentProjectId) },
  });
  const did = link?.delivery_project_id;
  return did ? asDeliveryProjectId(String(did)) : null;
}
