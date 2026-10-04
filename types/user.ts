export type UserRole = "admin" | "editor";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  active: boolean;
}
