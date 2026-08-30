export interface HealthResponse {
  ok: boolean;
}

export interface ReadyResponse {
  ok: boolean;
  migrations: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
