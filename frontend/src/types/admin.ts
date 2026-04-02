export interface User {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

export interface UserListResponse {
  items: User[];
}

export interface UserCreate {
  email: string;
  password: string;
  role: string;
}
