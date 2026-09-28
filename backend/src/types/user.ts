export interface SafeUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
}
