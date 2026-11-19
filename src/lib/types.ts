export type Person = {
  name: string;
  email?: string;
  /** true = GeoVictoria, false = cliente, null = no se sabe */
  gv: boolean | null;
};

export type MeetingSummary = {
  id: string; // id Samu (24 hex)
  title: string;
  date: string; // ISO 8601
  durationMin: number | null;
  host?: string;
  callType?: string;
  link?: string;
  emails: string[];
  people: Person[];
  /** Nombre sugerido del cliente, deducido del dominio de los correos externos. */
  client: string;
  internal: boolean;
  country: string;
  platformShort: string;
};

export type TranscriptLine = { t: string; speaker: string; text: string };

/** Formato de acta GeoVictoria (encabezado, objetivo, asistentes, temas, acuerdos). */
export type Asistente = { nombre: string; rol: string };
export type Tema = { texto: string; evidencia: string; verificada: boolean };
export type Acuerdo = {
  id: string;
  compromiso: string;
  /** Persona, área o empresa (p. ej. "Gestión Humana", "Bacu Foods + GeoVictoria") o "Por definir". */
  responsable: string;
  responsableEmail?: string;
  /** DD/MM/AAAA, "Por definir" o una condición breve dicha en la reunión ("Post prueba"). */
  fecha: string;
  /** Cita literal de la transcripción que respalda el acuerdo. */
  evidencia: string;
  verificada: boolean;
  advertencias: string[];
};

export type Acta = {
  meetingId: string;
  link?: string;
  tipo: string;
  cliente: string;
  titulo: string;
  pais: string;
  fecha: string; // DD/MM/AAAA
  objetivo: string;
  asistentesCliente: Asistente[];
  asistentesGV: Asistente[];
  temas: Tema[];
  cierre: string;
  acuerdos: Acuerdo[];
  generadoPor: { nombre: string; email: string };
  advertencias: string[];
};
