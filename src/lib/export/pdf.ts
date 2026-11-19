import PDFDocument from "pdfkit";
import path from "node:path";
import type { Acta } from "../types";
import { longDate } from "../acta/validate";
import { DOC, person } from "./brand";

/** Acta en PDF con el formato GeoVictoria (A4, Nunito incrustada). */
export function actaToPdf(a: Acta): Promise<Buffer> {
  const pub = path.join(process.cwd(), "public");
  const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 70, left: 82, right: 82 }, bufferPages: true, info: { Title: `${a.tipo} - ${a.titulo}`, Author: a.generadoPor.nombre } });
  doc.registerFont("N", path.join(pub, "fonts/Nunito-Regular.ttf"));
  doc.registerFont("NB", path.join(pub, "fonts/Nunito-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));

  const c = (h: string) => `#${h}`;
  const W = doc.page.width, H = doc.page.height, L = 82, R = W - 82, CW = R - L, BOTTOM = H - 80;
  const fecha = longDate(a.fecha);
  const font = (bold: boolean, size = 10, color = DOC.text) => doc.font(bold ? "NB" : "N").fontSize(size).fillColor(c(color));
  const hr = (y: number, color: string, w = 0.6) => doc.save().strokeColor(c(color)).lineWidth(w).moveTo(L, y).lineTo(R, y).stroke().restore();
  const ensure = (h: number) => { if (doc.y + h > BOTTOM) doc.addPage(); };

  // Encabezado
  doc.image(path.join(pub, "brand/logo.png"), L, 62, { width: 118 });
  font(false, 8, DOC.muted).text(a.tipo, L, 52, { width: CW, align: "right" });
  font(true, 12, DOC.title).text(a.titulo, L + CW * 0.36, 64, { width: CW * 0.64, align: "right" });
  font(false, 8, DOC.muted).text([a.pais, fecha].filter(Boolean).join(" · "), L, doc.y + 1, { width: CW, align: "right" });
  let y = Math.max(118, doc.y + 18);
  hr(y, DOC.yellow, 0.8); y += 18; hr(y, DOC.cyan, 0.8); y += 30;

  // Objetivo
  font(true, 10, DOC.title).text("Objetivo de la sesión", L, y); y = doc.y + 2; hr(y, DOC.yellow, 0.8);
  font(false).text(a.objetivo || "—", L, y + 6, { width: CW, lineGap: 2 });
  y = doc.y + 8; hr(y, DOC.rule); y += 28;

  // Asistentes en dos columnas
  const colW = CW / 2 - 10, x2 = L + CW / 2 + 6;
  font(true, 8.5, DOC.cyan).text(`ASISTENTES ${a.cliente.toUpperCase()}`, L, y, { width: colW });
  font(true, 8.5, DOC.cyan).text("ASISTENTES GEOVICTORIA", x2, y, { width: colW });
  const top = y + 16;
  font(false).text((a.asistentesCliente.length ? a.asistentesCliente : [{ nombre: "—", rol: "" }]).map(person).join("\n"), L, top, { width: colW, lineGap: 4 });
  const y1 = doc.y;
  font(false).text((a.asistentesGV.length ? a.asistentesGV : [{ nombre: "—", rol: "" }]).map(person).join("\n"), x2, top, { width: colW, lineGap: 4 });
  y = Math.max(y1, doc.y) + 8; hr(y, DOC.rule); y += 28;

  // Temas
  doc.y = y; ensure(40);
  font(true, 8.5, DOC.cyan).text("TEMAS TRATADOS", L, doc.y);
  doc.moveDown(0.3);
  for (const t of a.temas.length ? a.temas : [{ texto: "—" }]) {
    ensure(16);
    const ty = doc.y;
    font(false).text("•", L + 2, ty);
    font(false).text(t.texto, L + 14, ty, { width: CW - 14 });
    doc.y += 1.5;
  }
  if (a.cierre) font(false).text(a.cierre, L, doc.y, { width: CW });
  y = doc.y + 8; hr(y, DOC.rule); doc.y = y + 28;

  // Acuerdos
  ensure(60);
  font(true, 8.5, DOC.cyan).text("ACUERDOS Y PRÓXIMOS PASOS", L, doc.y);
  doc.y += 6;
  const cols = [CW * 0.58, CW * 0.25, CW * 0.17], pad = 8;
  const row = (cells: string[], head: boolean) => {
    font(head, 10, head ? "FFFFFF" : DOC.text);
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: cols[i] - pad * 2 }))) + pad * 2;
    if (doc.y + h > BOTTOM) doc.addPage();
    const ry = doc.y;
    if (head) doc.save().rect(L, ry, CW, h).fill(c(DOC.cyan)).restore();
    let x = L;
    cells.forEach((t, i) => {
      if (!head && i > 0) doc.save().strokeColor(c(DOC.border)).lineWidth(0.6).moveTo(x, ry).lineTo(x, ry + h).stroke().restore();
      font(head, 10, head ? "FFFFFF" : DOC.text).text(t, x + pad, ry + pad, { width: cols[i] - pad * 2 });
      x += cols[i];
    });
    if (!head) doc.save().strokeColor(c(DOC.border)).lineWidth(0.6).moveTo(L, ry).lineTo(L, ry + h).moveTo(R, ry).lineTo(R, ry + h).stroke().restore();
    doc.y = ry + h;
  };
  row(["Compromiso", "Responsable", "Fecha"], true);
  for (const t of a.acuerdos.length ? a.acuerdos : [{ compromiso: "No se registraron acuerdos.", responsable: "—", fecha: "—" }]) row([t.compromiso, t.responsable, t.fecha], false);
  hr(doc.y, DOC.border);

  // Pie en cada página
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    hr(H - 52, DOC.rule, 0.5);
    font(false, 8, DOC.muted).text(`GeoVictoria · ${a.tipo} · ${fecha}`, L, H - 44, { width: CW, lineBreak: false });
    if (range.count > 1) font(false, 8, DOC.muted).text(`${i + 1} / ${range.count}`, L, H - 44, { width: CW, align: "right", lineBreak: false });
    doc.page.margins.bottom = mb;
  }
  doc.end();
  return done;
}
