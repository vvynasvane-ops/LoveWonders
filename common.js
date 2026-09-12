export function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function placeholderPhoto() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'><rect width='100%' height='100%' fill='#161232'/></svg>`
  );
}

/** Generates a human-friendly, searchable member number like "LW-482913". Not sensitive — this is for lookup, not the private ID code. */
export function generateMemberNo() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `LW-${n}`;
}

/** True if lastActive (a Firestore Timestamp, Date, or ms number) was within the last 5 minutes. */
export function isOnlineNow(lastActive) {
  if (!lastActive) return false;
  const ms = lastActive.toMillis ? lastActive.toMillis() : (lastActive instanceof Date ? lastActive.getTime() : lastActive);
  return Date.now() - ms < 5 * 60 * 1000;
}

/** "Online now" / "Active 3h ago" / "" (never active) label for a profile. */
export function activityLabel(lastActive) {
  if (!lastActive) return "";
  if (isOnlineNow(lastActive)) return "Online now";
  const ms = lastActive.toMillis ? lastActive.toMillis() : (lastActive instanceof Date ? lastActive.getTime() : lastActive);
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return `Active ${mins}m ago`;
  if (mins < 1440) return `Active ${Math.floor(mins / 60)}h ago`;
  return `Active ${Math.floor(mins / 1440)}d ago`;
}

/** Cosmic "two stars orbiting" loading indicator (see styles.css .loader-orbit). Drop this into
 * any container while its real content is still streaming in from Firestore. */
export function loaderHtml(label) {
  return `
    <div class="loader-wrap">
      <div class="loader-orbit"></div>
      ${label ? `<div class="loader-label">${escapeHtml(label)}</div>` : ""}
    </div>`;
}

/** Full-page "racetrack" loader — a stroke chasing an oval loop. Used as a brief
 * splash while a protected page waits on requireAuth()/the initial data fetch. */
export function loaderTrackHtml(label) {
  return `
    <div class="loader-page">
      <svg class="loader-track" viewBox="0 0 55 23.1" height="34" width="81" preserveAspectRatio="xMidYMid meet">
        <path class="loader-track-bg" fill="none" stroke-width="4" pathLength="100"
          d="M26.7,12.2c3.5,3.4,7.4,7.8,12.7,7.8c5.5,0,9.6-4.4,9.6-9.5C49,5,45.1,1,39.8,1c-5.5,0-9.5,4.2-13.1,7.8l-3.4,3.3c-3.6,3.6-7.6,7.8-13.1,7.8C4.9,20,1,16,1,10.5C1,5.4,5.1,1,10.6,1c5.3,0,9.2,4.5,12.7,7.8L26.7,12.2z"/>
        <path class="loader-track-car" fill="none" stroke-width="4" pathLength="100"
          d="M26.7,12.2c3.5,3.4,7.4,7.8,12.7,7.8c5.5,0,9.6-4.4,9.6-9.5C49,5,45.1,1,39.8,1c-5.5,0-9.5,4.2-13.1,7.8l-3.4,3.3c-3.6,3.6-7.6,7.8-13.1,7.8C4.9,20,1,16,1,10.5C1,5.4,5.1,1,10.6,1c5.3,0,9.2,4.5,12.7,7.8L26.7,12.2z"/>
      </svg>
      ${label ? `<div class="loader-label">${escapeHtml(label)}</div>` : ""}
    </div>`;
}

/** Small rounded-track loader for in-place processing (photo compression). */
export function loaderPhotoHtml() {
  return `
    <svg class="loader-photo" viewBox="0 0 40 40" height="26" width="26" preserveAspectRatio="xMidYMid meet">
      <path class="loader-photo-bg" fill="none" stroke-width="4" pathLength="100"
        d="M29.76 18.72c0 7.28-3.92 13.6-9.84 16.96-2.88 1.68-6.24 2.64-9.84 2.64-3.6 0-6.88-.96-9.76-2.64 0-7.28 3.92-13.52 9.84-16.96 2.88-1.68 6.24-2.64 9.76-2.64s6.88.96 9.84 2.64c5.84 3.36 9.76 9.68 9.84 16.96-2.88 1.68-6.24 2.64-9.76 2.64-3.6 0-6.88-.96-9.84-2.64-5.84-3.36-9.76-9.68-9.76-16.96 0-7.28 3.92-13.6 9.76-16.96 5.84 3.36 9.76 9.68 9.76 16.96z"/>
      <path class="loader-photo-car" fill="none" stroke-width="4" pathLength="100"
        d="M29.76 18.72c0 7.28-3.92 13.6-9.84 16.96-2.88 1.68-6.24 2.64-9.84 2.64-3.6 0-6.88-.96-9.76-2.64 0-7.28 3.92-13.52 9.84-16.96 2.88-1.68 6.24-2.64 9.76-2.64s6.88.96 9.84 2.64c5.84 3.36 9.76 9.68 9.84 16.96-2.88 1.68-6.24 2.64-9.76 2.64-3.6 0-6.88-.96-9.84-2.64-5.84-3.36-9.76-9.68-9.76-16.96 0-7.28 3.92-13.6 9.76-16.96 5.84 3.36 9.76 9.68 9.76 16.96z"/>
    </svg>`;
}

/** Small "streaming dots" loader (gooey blend) for a message in flight. */
export function loaderStreamHtml() {
  return `
    <span class="loader-stream-wrap">
      <span class="loader-stream"><span></span><span></span><span></span><span></span><span></span></span>
      <svg width="0" height="0" style="position:absolute">
        <filter id="loader-stream-ooze">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="ooze"/>
          <feBlend in="SourceGraphic" in2="ooze"/>
        </filter>
      </svg>
    </span>`;
}

/** Small "merging blobs" loader (gooey blend) for an inline button's busy state. */
export function loaderBlobHtml() {
  return `
    <span class="loader-blob-wrap">
      <span class="loader-blob"></span>
      <svg width="0" height="0" style="position:absolute">
        <filter id="loader-blob-ooze">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="ooze"/>
          <feBlend in="SourceGraphic" in2="ooze"/>
        </filter>
      </svg>
    </span>`;
}

/** Splits a comma-separated input string into a clean array of short tags. */
export function parseTags(str) {
  return (str || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 12);
}

/** Renders an array of tags as small chip pills (reuses the existing .chip style). */
export function tagsHtml(tags) {
  return (tags || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("");
}

/** Builds one profile card's markup. `recommended` adds a small badge, `liked` fills the heart button. */
export function personCardHtml(uid, p, recommended, liked) {
  const sub = (p.bio || "").slice(0, 40) + ((p.bio || "").length > 40 ? "…" : "");
  const meta = [p.age ? `${p.age}` : "", p.city || p.country || ""].filter(Boolean).join(" · ");
  const online = isOnlineNow(p.lastActive) && p.showOnlineStatus !== false;
  return `
    <div class="person-card" data-uid="${uid}">
      ${recommended ? `<span class="chip recommended">Recommended</span>` : ""}
      ${online ? `<span class="online-badge" title="Online now"></span>` : ""}
      <button type="button" class="like-btn card-like-btn ${liked ? "liked" : ""}" data-like-uid="${uid}" title="${liked ? "Unlike" : "Like"}">${liked ? "&#10084;" : "&#9825;"}</button>
      <img class="person-photo" src="${p.photoURL || placeholderPhoto()}" alt="${escapeHtml(p.name)}">
      <div class="person-meta">
        <div class="person-name">${escapeHtml(p.name || "Member")}</div>
        <div class="person-sub">${escapeHtml(sub)}</div>
        ${meta ? `<div class="person-sub">${escapeHtml(meta)}</div>` : ""}
      </div>
    </div>`;
}
