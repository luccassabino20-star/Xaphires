// SVGs inline, no mesmo molde do resto do app (viewBox 24x24, fill=currentColor
// herdando a cor do texto) - ver src/components/CardItem.jsx. Sem lib de ícone
// nova só para uma toolbar decorativa.
function Svg({ d, size = 14, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...rest}>
      <path fill="currentColor" d={d} />
    </svg>
  );
}

export const IconNew = (p) => <Svg {...p} d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 1.5V8h4.5L14 3.5zM11 11v3H8v2h3v3h2v-3h3v-2h-3v-3z" />;
export const IconOpen = (p) => <Svg {...p} d="M3 5a1 1 0 0 1 1-1h6l2 2h8a1 1 0 0 1 1 1v2H3V5zm0 5h20l-1.8 9.18A1 1 0 0 1 20.23 20H4.77a1 1 0 0 1-.97-.82L2 10z" />;
export const IconSave = (p) => <Svg {...p} d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 2v5h9V5H7zm0 8v6h10v-6H7z" />;
export const IconUndo = (p) => <Svg {...p} d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.5 7.5 0 0 1 12.5 11c3.15 0 5.93 1.72 7.32 4.28l1.78-1.15A9.5 9.5 0 0 0 12.5 8z" />;
export const IconPrint = (p) => <Svg {...p} d="M6 3h12v5H6V3zM4 9h16a2 2 0 0 1 2 2v6h-4v4H6v-4H2v-6a2 2 0 0 1 2-2zm4 8v4h8v-4H8zm9-4.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />;
export const IconExport = (p) => <Svg {...p} d="M8 3 3 8h3.5v7H3l5 5 5-5H9.5V8H13L8 3zm8 1v12.5h-3.5l5 5 5-5H19V4h-3z" />;
export const IconSearch = (p) => <Svg {...p} d="M10.5 3a7.5 7.5 0 0 1 5.92 12.12l5.23 5.23-1.42 1.42-5.23-5.23A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" />;
export const IconZoom = (p) => <Svg {...p} d="M10.5 3a7.5 7.5 0 0 1 5.92 12.12l5.23 5.23-1.42 1.42-5.23-5.23A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm-1 2h2v2.5H14v2h-2.5V14h-2v-2.5H7v-2h2.5V7z" />;
export const IconChevron = (p) => <Svg {...p} d="M8.5 5 7 6.5 13.5 13 7 19.5 8.5 21 16.5 13z" />;

export const IconMeeting = (p) => <Svg {...p} d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 19c0-3 3-5.5 6-5.5s6 2.5 6 5.5v1H3v-1zm12-3.4c2.3.4 4 2.2 4 4.4v1h-3v-1c0-1.7-.4-3.2-1-4.4z" />;
export const IconCall = (p) => <Svg {...p} d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.6 21 3 13.4 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1.1z" />;
export const IconMail = (p) => <Svg {...p} d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1.4 2 6.6 5.5L18.6 6H5.4zM19 8.1l-6.4 5.3a1 1 0 0 1-1.3 0L5 8.1V18h14V8.1z" />;
export const IconCheck = (p) => <Svg {...p} d="M7 2h10a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1V3a1 1 0 0 1 1-1zm1 4H7v13h10V6h-1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6zm.5 6.5 1.6 1.6L13.5 11 15 12.4l-4 4.4-3.4-3.5z" />;
export const IconWarning = (p) => <Svg {...p} d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z" />;

export const GANTT_ICONS = { meeting: IconMeeting, call: IconCall, mail: IconMail, check: IconCheck };
