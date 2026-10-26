import type { SessionUser } from "../shared/types.ts";
import type { Queryable } from "./db.ts";
import { accessibleCityIds } from "./repositories/users.ts";

export const VISITOR: SessionUser = {
  id: 0,
  username: "visitante",
  name: "Visitante",
  role: "admin",
};

export async function visibleCityIds(db: Queryable, user: SessionUser): Promise<number[] | null> {
  return user.role === "admin" ? null : accessibleCityIds(db, user.id);
}

export async function canAccessCity(
  db: Queryable,
  user: SessionUser,
  cityId: number,
): Promise<boolean> {
  const ids = await visibleCityIds(db, user);
  return ids === null || ids.includes(cityId);
}
