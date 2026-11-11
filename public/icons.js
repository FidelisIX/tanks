// Small hand-drawn SVG illustrations for weapons, shop items and upgrades.
// eslint-disable-next-line no-unused-vars
const ICONS = (() => {
  const svg = (body) => `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
  return {
    // trench digger: a cut through a hill with the digging head at its end
    trench: svg(`<path d="M1 30V14c4-6 9-9 15-9s11 3 15 9v16z" fill="#8a6a3c" stroke="#5b4426" stroke-width="1.2"/>
      <path d="M4 15l8 6 9 2" stroke="#1b1f27" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g transform="rotate(12 23 23)"><path d="M20 20.5h4l4 2.5-4 2.5h-4z" fill="#cbd5e1" stroke="#64748b" stroke-width=".9"/>
      <path d="M22 20.5v5M24.5 21v4" stroke="#64748b" stroke-width=".9"/></g>`),
    // pointed shell with a copper band
    shell: svg(`<g transform="rotate(-35 16 16)">
      <path d="M16 3c4 3 5 7 5 11v12h-10V14c0-4 1-8 5-11z" fill="#d9c27a" stroke="#8a7432" stroke-width="1.2"/>
      <rect x="11" y="20" width="10" height="3" fill="#c46a3a"/><rect x="10.5" y="26" width="11" height="3" rx="1" fill="#8a7432"/></g>`),
    // round bomb with tail fins
    heavy: svg(`<path d="M7 25l-4 4M9 27l-3 3M5 23l-3 3" stroke="#6b7280" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="18" cy="14" r="10" fill="#4b5563" stroke="#1f2937" stroke-width="1.4"/>
      <circle cx="14.5" cy="10.5" r="2.6" fill="#9ca3af" opacity=".8"/>`),
    // three small shells in a fan
    triple: svg([-28, 0, 28].map((a) => `<g transform="rotate(${a} 16 28)">
      <path d="M16 6c2 2 2.6 4 2.6 6v8h-5.2v-8c0-2 .6-4 2.6-6z" fill="#d9c27a" stroke="#8a7432" stroke-width="1"/>
      <rect x="13.4" y="17" width="5.2" height="1.8" fill="#c46a3a"/></g>`).join('')),
    // lumpy clod of earth with grass
    dirt: svg(`<path d="M5 22c-1-5 3-9 7-9 2-4 8-4 10 0 4 0 7 3 6 8-1 4-4 6-11 6S6 26 5 22z" fill="#8a6a3c" stroke="#5b4426" stroke-width="1.3"/>
      <circle cx="12" cy="20" r="1.4" fill="#5b4426"/><circle cx="20" cy="22" r="1.2" fill="#5b4426"/><circle cx="17" cy="17" r="1" fill="#5b4426"/>
      <path d="M13 13l1-4M16 12.5l0-5M19 13l1.5-4" stroke="#6fbf4a" stroke-width="1.6" stroke-linecap="round"/>`),
    // striped rolling ball
    ball: svg(`<circle cx="16" cy="16" r="11" fill="#e5e7eb" stroke="#6b7280" stroke-width="1.3"/>
      <path d="M8 8c6 4 10 12 8 19M24 8c-3 2-4 6-3 9" stroke="#e8553b" stroke-width="2.6" fill="none"/>
      <path d="M3 29h6M2 25h4" stroke="#8d97a8" stroke-width="1.6" stroke-linecap="round"/>`),
    // drill bit pointing down into the ground
    drill: svg(`<rect x="2" y="22" width="28" height="8" fill="#5d4a2f"/>
      <path d="M12 3h8v6h-8z" fill="#6b7280"/>
      <path d="M12 9h8l-1 6-3 13-3-13z" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
      <path d="M12.5 12l7-2M13 16l6-2M14 20l4-1.5" stroke="#64748b" stroke-width="1.2"/>`),
    // bomb splitting into small bomblets
    cluster: svg(`<circle cx="12" cy="12" r="7" fill="#7c3aed" stroke="#3b1d7a" stroke-width="1.3"/>
      <circle cx="10" cy="10" r="1.6" fill="#c4b5fd"/>
      <circle cx="22" cy="18" r="2.6" fill="#7c3aed"/><circle cx="27" cy="25" r="2.2" fill="#7c3aed"/>
      <circle cx="18" cy="26" r="2.4" fill="#7c3aed"/><circle cx="25" cy="10" r="2" fill="#7c3aed"/>
      <path d="M17 15l2 1.5M16 18l1 4M18 13l4-2" stroke="#c4b5fd" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>`),
    // aerial bomb: long body with rounded nose, box tail with fins, radiation sign; flying nose-down
    nuke: svg(`<g transform="rotate(35 16 16)">
      <path d="M3 10.5l6 3v5l-6 3z" fill="#a16207" stroke="#713f12" stroke-width="1"/>
      <path d="M2.5 15h7" stroke="#713f12" stroke-width="1.2"/>
      <path d="M9 12.5h12c4.5 0 8 1.6 9 3.5-1 1.9-4.5 3.5-9 3.5H9z" fill="#facc15" stroke="#854d0e" stroke-width="1.2"/>
      <path d="M12 12.5v7M24.5 13.1v5.8" stroke="#854d0e" stroke-width="1.1"/>
      <circle cx="18" cy="16" r="3.1" fill="#facc15"/>
      ${[0, 120, 240].map((a) => `<path d="M18 16l-1.6-2.8a3.2 3.2 0 0 1 3.2 0z" fill="#1f2937" transform="rotate(${a} 18 16)"/>`).join('')}
      <circle cx="18" cy="16" r=".7" fill="#1f2937"/></g>`),
    // glowing energy bubble around a tiny tank
    shield: svg(`<circle cx="16" cy="16" r="13" fill="rgba(127,216,255,.18)" stroke="#7fd8ff" stroke-width="2"/>
      <path d="M8 10a10 10 0 0 1 6-4" stroke="#e0f6ff" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <rect x="9" y="17" width="14" height="4" rx="1.5" fill="#94a3b8"/><path d="M12 17a4 4 0 0 1 8 0z" fill="#94a3b8"/>
      <rect x="8" y="21" width="16" height="3" rx="1.5" fill="#334155"/>`),
    // jerrycan
    fuel: svg(`<path d="M8 8h13l4 4v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.3"/>
      <rect x="9" y="4" width="7" height="4" rx="1" fill="#7f1d1d"/>
      <path d="M10 14l10 10M20 14l-10 10" stroke="#fca5a5" stroke-width="1.6"/>`),
    // two swirls with a dashed jump between them
    teleport: svg(`<ellipse cx="8" cy="25" rx="6" ry="2.4" fill="none" stroke="#c4b5fd" stroke-width="1.8"/>
      <ellipse cx="24" cy="25" rx="6" ry="2.4" fill="none" stroke="#c4b5fd" stroke-width="1.8"/>
      <path d="M8 22C8 10 24 10 24 21" stroke="#e9d5ff" stroke-width="1.8" stroke-dasharray="2.4 2.4" fill="none"/>
      <path d="M21 18l3 4 3-4" stroke="#e9d5ff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="8" cy="19" r="2" fill="#c4b5fd"/>`),
    // upgrades
    armor: svg(`<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="#64748b" stroke="#1e293b" stroke-width="1.4"/>
      <path d="M16 7l7 2.6V15c0 4.6-3 8-7 9.6z" fill="#94a3b8"/>`),
    shieldBoost: svg(`<circle cx="14" cy="17" r="11" fill="rgba(127,216,255,.18)" stroke="#7fd8ff" stroke-width="2"/>
      <path d="M24 3v8M20 7h8" stroke="#6fd36f" stroke-width="2.6" stroke-linecap="round"/>`),
    shock: svg(`<rect x="11" y="2" width="10" height="5" rx="1.5" fill="#64748b"/>
      <path d="M16 7l6 2.5-12 3 12 3-12 3 12 3-6 2.5" stroke="#f2c230" stroke-width="2.2" fill="none" stroke-linejoin="round"/>
      <rect x="11" y="25" width="10" height="5" rx="1.5" fill="#64748b"/>`),
    // tank track on a steep slope
    climber: svg(`<path d="M2 30L30 6v24z" fill="#5d4a2f"/>
      <g transform="rotate(-40 14 18)"><rect x="5" y="15" width="18" height="6" rx="3" fill="#334155" stroke="#94a3b8" stroke-width="1"/>
      <circle cx="8.5" cy="18" r="1.6" fill="#94a3b8"/><circle cx="14" cy="18" r="1.6" fill="#94a3b8"/><circle cx="19.5" cy="18" r="1.6" fill="#94a3b8"/>
      <path d="M7 12h14" stroke="#f2c230" stroke-width="2" stroke-linecap="round"/></g>`),
    cannon: svg(`<rect x="4" y="18" width="14" height="8" rx="2" fill="#64748b"/>
      <path d="M12 19l14-10 2 3-14 10z" fill="#94a3b8" stroke="#334155" stroke-width="1"/>
      <path d="M27 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#f08a24"/>`),
  };
})();
