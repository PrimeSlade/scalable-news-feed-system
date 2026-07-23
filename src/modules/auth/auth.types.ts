export interface AuthIdentity {
  userId: string;
}

export interface RefreshIdentity extends AuthIdentity {
  sessionId: string;
}

export interface SafeUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterInput {
  username: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}
