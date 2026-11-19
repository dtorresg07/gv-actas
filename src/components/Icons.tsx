/** Íconos de línea estilo Lucide (stroke 1.75), según la guía de marca. */
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const Calendar = () => (<svg {...base}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
export const Clock = () => (<svg {...base}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
export const FileText = () => (<svg {...base}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>);
export const Download = () => (<svg {...base}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>);
export const Send = () => (<svg {...base}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>);
export const X = () => (<svg {...base}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const Alert = () => (<svg {...base}><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3l-8.47-14.14a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>);
