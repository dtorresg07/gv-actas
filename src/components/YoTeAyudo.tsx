/** Hashtag de marca, siempre en tres tonos: #Yo gris · Te celeste · Ayudo amarillo. */
export function YoTeAyudo({ size = 18 }: { size?: number }) {
  return (
    <span className="yta" style={{ fontSize: size }} aria-label="#YoTeAyudo">
      <span style={{ color: "#646464" }}>#Yo</span><span style={{ color: "#00aff2" }}>Te</span><span style={{ color: "#ffbb00" }}>Ayudo</span>
    </span>
  );
}
