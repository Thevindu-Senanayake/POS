import type { UserRole } from '@pos/shared';

/** JWT access-token payload. `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

/** The authenticated principal attached to `request.user` by the JWT/Local strategy. */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: UserRole;
}
