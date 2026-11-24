const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Busca un nombre en la lista "CSS Responsable": igual, o con todas sus palabras (p. ej. "Daniela Torres" → "Daniela Torres Garzón"). */
export function matchName(options: string[], name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = fold(name);
  const exact = options.find((o) => fold(o) === n);
  if (exact) return exact;
  const words = n.split(" ").filter((w) => w.length > 1);
  if (words.length < 2) return undefined;
  const hits = options.filter((o) => { const ow = fold(o).split(" "); return words.every((w) => ow.includes(w)); });
  return hits.length === 1 ? hits[0] : undefined;
}

