/* Semua ikon berupa SVG inline (tanpa emoji / library ikon). */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function LogoMark({ size = 26, brand = false }) {
  return (
    <svg className={brand ? 'brand-mark' : undefined} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="26" height="18" rx="2" />
      <path d="M3 10l13 9 13-9" />
    </svg>
  );
}

export const IconMenu = () => (
  <svg viewBox="0 0 24 24" {...S} width="18" height="18"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconClose = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" {...S} width={size} height={size}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconHome = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M4 11l8-7 8 7" /><path d="M6 10v9a1 1 0 0 0 1 1h3.5v-5h3V20H17a1 1 0 0 0 1-1v-9" /></svg>
);
export const IconSteps = () => (
  <svg viewBox="0 0 24 24" {...S}><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8.2 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.8" /></svg>
);
export const IconGrid = () => (
  <svg viewBox="0 0 24 24" {...S}><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></svg>
);
export const IconFaq = () => (
  <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7" /><path d="M12 17v.01" /></svg>
);
export const IconCode = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" /></svg>
);
export const IconLogin = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
);
export const IconMail = () => (
  <svg viewBox="0 0 24 24" {...S}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7.5l8.5 6 8.5-6" /></svg>
);
export const IconTelegram = () => (
  <svg viewBox="0 0 24 24" {...S}><path d="M21 4L3 11l6 2.2L11.5 20l3-4.2L19 19.5z" /><path d="M9 13.2L21 4" /></svg>
);
export const IconCopy = () => (
  <svg viewBox="0 0 24 24" {...S} width="16" height="16"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>
);
export const IconCheck = () => (
  <svg viewBox="0 0 24 24" {...S} width="16" height="16" className="tick-ico"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconRefresh = () => (
  <svg viewBox="0 0 24 24" {...S} width="16" height="16"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
);
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" {...S} width="16" height="16"><path d="M12 5v14M5 12h14" /></svg>
);
export const IconInbox = () => (
  <svg viewBox="0 0 24 24" {...S} width="40" height="40"><rect x="4" y="6" width="16" height="12" rx="2.5" /><path d="M4.5 8l7.5 5.5L19.5 8" /></svg>
);
export const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" width="15" height="15"><path d="M4 7h16M9 7V5h6v2M8 7v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" /></svg>
);
export const IconCaps = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4l7 8h-4v5H9v-5H5z" /><path d="M9 21h6" /></svg>
);

export const FlagId = () => (
  <svg viewBox="0 0 3 2" width="27" height="18" xmlns="http://www.w3.org/2000/svg">
    <rect width="3" height="1" fill="#CE1126" />
    <rect y="1" width="3" height="1" fill="#fff" />
  </svg>
);
export const FlagEn = () => (
  <svg viewBox="0 0 60 30" width="36" height="18" xmlns="http://www.w3.org/2000/svg">
    <clipPath id="ukS"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
    <clipPath id="ukT"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
    <g clipPath="url(#ukS)">
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#ukT)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </g>
  </svg>
);
