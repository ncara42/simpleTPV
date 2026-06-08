import type {
  CreatePromotionInput,
  PromoConditionType,
  PromoDiscountType,
  Promotion as ApiPromotion,
  UpdatePromotionInput,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { CreatePromotionInput, PromoConditionType, PromoDiscountType, UpdatePromotionInput };

export type PromoStatus = 'activa' | 'programada' | 'expirada' | 'pausada';

// Promoción en forma de UI: discountValue numérico y fechas 'YYYY-MM-DD'. La API las
// sirve como Decimal (string) y DATE (ISO); `toView` las normaliza para los formularios.
export interface Promotion {
  id: string;
  name: string;
  conditionType: PromoConditionType;
  threshold: number;
  discountType: PromoDiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  active: boolean;
}

function toView(p: ApiPromotion): Promotion {
  return {
    id: p.id,
    name: p.name,
    conditionType: p.conditionType,
    threshold: p.threshold,
    discountType: p.discountType,
    discountValue: Number(p.discountValue),
    startDate: p.startDate.slice(0, 10),
    endDate: p.endDate.slice(0, 10),
    active: p.active,
  };
}

function todayLocal(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Estado efectivo a partir de fechas + active (el backend solo guarda los hechos;
// el estado es una derivación de presentación). `today` inyectable para tests.
export function promoStatus(
  p: Pick<Promotion, 'startDate' | 'endDate' | 'active'>,
  today: string = todayLocal(),
): PromoStatus {
  if (today < p.startDate) return 'programada';
  if (today > p.endDate) return 'expirada';
  return p.active ? 'activa' : 'pausada';
}

export async function listPromotions(): Promise<Promotion[]> {
  const rows = await api.get<ApiPromotion[]>('/promotions');
  return rows.map(toView);
}

export function createPromotion(input: CreatePromotionInput): Promise<ApiPromotion> {
  return api.post<ApiPromotion>('/promotions', input);
}

export function updatePromotion(id: string, input: UpdatePromotionInput): Promise<ApiPromotion> {
  return api.patch<ApiPromotion>(`/promotions/${id}`, input);
}

export function deletePromotion(id: string): Promise<void> {
  return api.del(`/promotions/${id}`);
}
