import { test } from "node:test";
import assert from "node:assert/strict";
process.env.NEXTAUTH_SECRET = "test-secret";
const { createChallenge, readChallenge, verifyCode } = await import("./otp.ts");

test("código: correcto una sola vez, incorrecto, otro correo, cookie alterada, límite de intentos", () => {
  const { code, cookie } = createChallenge("ana@geovictoria.com");
  const ch = readChallenge(cookie);
  assert.equal(verifyCode(ch, "otra@geovictoria.com", code), "invalid");
  assert.equal(verifyCode(ch, "ana@geovictoria.com", code === "123456" ? "654321" : "123456"), "invalid");
  assert.equal(verifyCode(ch, "ana@geovictoria.com", code), "ok");
  assert.equal(verifyCode(ch, "ana@geovictoria.com", code), "expired", "no se puede reutilizar");
  assert.equal(readChallenge(cookie.slice(0, -2) + "xx"), null, "firma alterada");

  const b = createChallenge("ana@geovictoria.com");
  const chb = readChallenge(b.cookie);
  const bad = b.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal(verifyCode(chb, "ana@geovictoria.com", bad), "invalid");
  assert.equal(verifyCode(chb, "ana@geovictoria.com", b.code), "locked", "tras 5 intentos se bloquea");
});
