-- AlterTable
-- IVA congelado por línea: aditivo con DEFAULT 21 para las filas existentes.
ALTER TABLE "SaleLine" ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 21;
