/** Frases motivacionales para el pop-up de bienvenida (Customer Success, productividad, equipo). */
export const PHRASES = [
  "Cada reunión es una oportunidad para fortalecer la confianza con nuestros clientes.",
  "La claridad en los acuerdos es la clave de un acompañamiento impecable.",
  "Simplifica tus procesos hoy para impactar más cuentas mañana.",
  "Un compromiso bien registrado es un compromiso que se cumple.",
  "Escuchar primero y documentar después: así se construyen relaciones de largo plazo.",
  "El seguimiento oportuno convierte una buena reunión en un cliente feliz.",
  "Menos tiempo redactando, más tiempo acompañando a tus clientes.",
  "Cuando el equipo comparte la misma información, el cliente lo nota.",
  "Cada tarea cerrada a tiempo suma confianza en la cuenta.",
  "Un acta clara hoy evita un malentendido mañana.",
  "El éxito del cliente se construye una conversación a la vez.",
  "Detrás de cada acuerdo hay una persona que confía en ti. #YoTeAyudo",
];

export function randomPhrase(exclude?: string): string {
  const pool = PHRASES.filter((p) => p !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}
