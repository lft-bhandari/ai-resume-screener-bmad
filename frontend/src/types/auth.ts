export interface LoginRequest {
  email: string;
  password: string;
}

// Mirrors backend app/schemas/auth.py: TokenResponse
export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: string;
}

// Mirrors backend app/schemas/auth.py: UserMeResponse
export interface UserMeResponse {
  email: string;
  role: string;
}

// In-memory session state held in AuthContext
export interface AuthUser {
  email: string;
  role: string;
  token: string;
}
