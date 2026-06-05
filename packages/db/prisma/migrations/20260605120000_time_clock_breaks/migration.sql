-- Amplía el control horario con pausas/descansos.
-- Solo añade valores al enum; la tabla TimeClockEntry no cambia, así que su RLS y
-- los GRANT existentes (migración 20260603110000) siguen aplicando sin tocar nada.
ALTER TYPE "TimeClockType" ADD VALUE IF NOT EXISTS 'BREAK_START';
ALTER TYPE "TimeClockType" ADD VALUE IF NOT EXISTS 'BREAK_END';
