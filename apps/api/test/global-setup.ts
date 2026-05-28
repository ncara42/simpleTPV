// Fija secretos JWT de test si el entorno no los provee. El código de producción
// exige JWT_SECRET/JWT_REFRESH_SECRET y falla al arrancar sin ellos (sin defaults
// hardcodeados), así que los tests de integración que arrancan AppModule los
// necesitan definidos. Valores de test, nunca de producción.
export default function setup(): void {
  process.env.JWT_SECRET ??= 'test-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
}
