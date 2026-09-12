// Renders the same 5-item nav everywhere (top bar on wide screens, fixed
// bottom bar on narrow ones — see the @media block in styles.css). One
// source of truth so every page stays in sync automatically.

const ITEMS = [
  { id: "discover", href: "discover.html", label: "Discover", icon: "⌕" },
  { id: "messages", href: "messages.html", label: "Messages", icon: "✉" },
  { id: "profile", href: "profile.html", label: "Profile", icon: "☺" },
  { id: "settings", href: "settings.html", label: "Theme", icon: "☰" }
];

export function renderNav(activeId) {
  const mount = document.querySelector("#nav-mount");
  if (!mount) return;
  mount.innerHTML = `<nav class="appnav">${ITEMS.map(item => `
    <a class="appnav-item ${item.id === activeId ? "active" : ""}" href="${item.href}">
      <span class="appnav-icon">${item.icon}</span><span class="appnav-label">${item.label}</span>
    </a>`).join("")}</nav>`;
}
