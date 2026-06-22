// Variables mínimas para que getHttpConfig() resuelva en los tests unitarios.
process.env['MCP_ISSUER_URL'] ??= 'http://localhost:8766';
process.env['MCP_ENC_KEY'] ??= 'unit-test-encryption-key';
