export interface Config {
  apiUrl: string;
  email: string;
  password: string;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;

  const apiUrl = process.env['TPV_API_URL'] ?? 'http://localhost:3001';
  const email = process.env['TPV_EMAIL'];
  const password = process.env['TPV_PASSWORD'];

  if (!email) throw new Error('TPV_EMAIL env var is required');
  if (!password) throw new Error('TPV_PASSWORD env var is required');

  _config = { apiUrl, email, password };
  return _config;
}
