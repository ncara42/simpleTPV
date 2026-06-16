import type { MeProfile, UserRole } from '@simpletpv/auth';

import { api } from './auth.js';

export type { MeProfile };

// Perfil del usuario autenticado: el JWT solo lleva sub/organizationId/role, así
// que el nombre real del empleado se pide al backend (GET /me) para la cabecera.
export function getMe(): Promise<MeProfile> {
  return api.get<MeProfile>('/me');
}

// Etiqueta legible del rol para el subtítulo de la cuenta en la cabecera del TPV.
const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Encargado',
  CLERK: 'Dependiente',
};

export function roleLabel(role: UserRole | undefined): string {
  return role ? ROLE_LABELS[role] : 'Dependiente';
}
