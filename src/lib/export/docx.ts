import {
  AlignmentType, BorderStyle, CharacterSet, Document, Footer, ImageRun, Packer, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Acta } from "../types";
import { longDate } from "../acta/validate";
import { DOC, person } from "./brand";

/** Acta en Word con el formato GeoVictoria. Nunito incrustada; cuerpo 10 pt, título 12 pt, etiquetas 8–8,5 pt. */
const F = "Nunito";
const CONTENT_TWIPS = 9070; // A4 menos márgenes de 2,5 cm

const run = (text: string, o: { size?: number; color?: string; bold?: boolean; italics?: boolean } = {}) =>
  new TextRun({ text, font: F, size: o.size ?? 20, color: o.color ?? DOC.text, bold: o.bold, italics: o.italics });

const para = (children: TextRun[], o: { after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bullet?: boolean } = {}) =>
  new Paragraph({ children, spacing: { after: o.after ?? 60 }, alignment: o.align, bullet: o.bullet ? { level: 0 } : undefined });

const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const line = (color: string, after = 120) => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } }, spacing: { after } });
const label = (t: string) => new Paragraph({ children: [run(t.toUpperCase(), { bold: true, color: DOC.cyan, size: 17 })], spacing: { before: 240, after: 80 } });

export async function actaToDocx(a: Acta): Promise<Buffer> {
  const dir = path.join(process.cwd(), "public");
  const [regular, bold, logo] = await Promise.all([
    readFile(path.join(dir, "fonts/Nunito-Regular.ttf")),
    readFile(path.join(dir, "fonts/Nunito-Bold.ttf")),
    readFile(path.join(dir, "brand/logo.png")),
  ]);
  const fecha = longDate(a.fecha);
  const sub = [a.pais, fecha].filter(Boolean).join(" · ");

  const header = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, borders: noBorders,
        children: [new Paragraph({ children: [new ImageRun({ type: "png", data: logo, transformation: { width: 150, height: 26 } })] })] }),
      new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, borders: noBorders, children: [
        para([run(a.tipo, { size: 16, color: DOC.muted })], { align: AlignmentType.RIGHT, after: 20 }),
        para([run(a.titulo, { bold: true, size: 24, color: DOC.title })], { align: AlignmentType.RIGHT, after: 20 }),
        para([run(sub, { size: 16, color: DOC.muted })], { align: AlignmentType.RIGHT, after: 0 }),
      ] }),
    ] })],
  });

  const column = (title: string, list: Acta["asistentesGV"]) => [
    new Paragraph({ children: [run(title.toUpperCase(), { bold: true, color: DOC.cyan, size: 17 })], spacing: { after: 80 } }),
    ...(list.length ? list.map((p) => para([run(person(p))])) : [para([run("—")])]),
  ];
  const attendees = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: column(`Asistentes ${a.cliente}`, a.asistentesCliente) }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: column("Asistentes GeoVictoria", a.asistentesGV) }),
    ] })],
  });

  const W = [5260, 2270, 1540];
  const bd = { style: BorderStyle.SINGLE, size: 4, color: DOC.border };
  const cell = (text: string, head: boolean, w: number) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: DOC.cyan } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({ children: [run(text, { bold: head, color: head ? "FFFFFF" : DOC.text })] })],
  });
  const rows = [new TableRow({ tableHeader: true, children: [cell("Compromiso", true, W[0]), cell("Responsable", true, W[1]), cell("Fecha", true, W[2])] })];
  const items = a.acuerdos.length ? a.acuerdos : [{ compromiso: "No se registraron acuerdos.", responsable: "—", fecha: "—" }];
  for (const t of items) rows.push(new TableRow({ children: [cell(t.compromiso, false, W[0]), cell(t.responsable, false, W[1]), cell(t.fecha, false, W[2])] }));

  const doc = new Document({
    creator: a.generadoPor.nombre,
    title: `${a.tipo} - ${a.titulo}`,
    fonts: [{ name: F, data: regular, bold, characterSet: CharacterSet.ANSI }],
    styles: { default: { document: { run: { font: F, size: 20, color: DOC.text } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1418, right: 1418 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: DOC.rule, space: 4 } },
        children: [run(`GeoVictoria · ${a.tipo} · ${fecha}`, { size: 16, color: DOC.muted })],
      })] }) },
      children: [
        header,
        new Paragraph({ spacing: { after: 200 } }),
        line(DOC.yellow, 200), line(DOC.cyan, 280),
        new Paragraph({ children: [run("Objetivo de la sesión", { bold: true, color: DOC.title })], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DOC.yellow, space: 2 } }, spacing: { after: 80 } }),
        para([run(a.objetivo || "—")], { after: 80 }),
        line(DOC.rule, 200),
        attendees,
        line(DOC.rule, 0),
        label("Temas tratados"),
        ...(a.temas.length ? a.temas.map((t) => para([run(t.texto)], { bullet: true })) : [para([run("—")])]),
        ...(a.cierre ? [para([run(a.cierre)], { after: 80 })] : []),
        line(DOC.rule, 0),
        label("Acuerdos y próximos pasos"),
        new Table({
          width: { size: CONTENT_TWIPS, type: WidthType.DXA }, columnWidths: W, layout: TableLayoutType.FIXED,
          borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: none, insideVertical: bd }, rows,
        }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}
