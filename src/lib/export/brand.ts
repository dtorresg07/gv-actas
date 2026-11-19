/** Colores del documento (marca GeoVictoria). Hex sin '#'. */
export const DOC = {
  text: "646464",
  title: "4E4E4E",
  muted: "8A8F96",
  cyan: "00AFF2",
  yellow: "FFBB00",
  rule: "DFE2E7",
  border: "C4C8CF",
};

export const person = (p: { nombre: string; rol: string }) => (p.rol ? `${p.nombre} – ${p.rol}` : p.nombre);
