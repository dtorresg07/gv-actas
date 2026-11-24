import test from "node:test";
import assert from "node:assert/strict";
import { matchName } from "./names.ts";

const list = ["-None-", "Clara Toro", "Daniela Torres Garzón", "Claudia Anlas", "Iván Mardones"];

test("CSS Responsable: exacto, sin tildes y con nombre corto", () => {
  assert.equal(matchName(list, "Daniela Torres Garzón"), "Daniela Torres Garzón");
  assert.equal(matchName(list, "daniela torres garzon"), "Daniela Torres Garzón");
  assert.equal(matchName(list, "Daniela Torres"), "Daniela Torres Garzón");
  assert.equal(matchName(list, "Ivan Mardones"), "Iván Mardones");
  assert.equal(matchName(list, "Daniela"), undefined);
  assert.equal(matchName(list, "Pedro Pérez"), undefined);
});
