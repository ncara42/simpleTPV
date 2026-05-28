export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

export async function pingHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`API /health respondió ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}
