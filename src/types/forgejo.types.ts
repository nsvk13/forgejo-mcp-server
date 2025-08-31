export interface ForgejoConfig {
  baseUrl: string;
  token: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url: string;
  private: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  size: number;
  language?: string;
  default_branch: string;
}

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    id: number;
    login: string;
    full_name: string;
  };
}

export interface FileContent {
  content: string;
  size: number;
  name: string;
  path: string;
  sha: string;
  type: string;
  encoding: string;
}