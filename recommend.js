// A small, transparent scoring function — no hidden ranking algorithm.
// Each stated preference that a candidate matches adds points; a blank
// or "Any" preference simply doesn't filter anyone out.

function norm(v) {
  return (v || "").toString().trim().toLowerCase();
}

export function matchScore(myPrefs, candidate) {
  if (!myPrefs) return 0;
  let score = 0;

  const min = Number(myPrefs.ageMin) || 0;
  const max = Number(myPrefs.ageMax) || 0;
  if (candidate.age && (min || max)) {
    const okMin = !min || candidate.age >= min;
    const okMax = !max || candidate.age <= max;
    if (okMin && okMax) score += 3;
  }
  if (myPrefs.country && norm(myPrefs.country) === norm(candidate.country)) score += 2;
  if (myPrefs.ethnicity && norm(myPrefs.ethnicity) === norm(candidate.ethnicity)) score += 2;
  if (myPrefs.nationality && norm(myPrefs.nationality) === norm(candidate.nationality)) score += 2;

  return score;
}

/** True once at least one taste preference has been set. */
export function hasPreferences(myPrefs) {
  if (!myPrefs) return false;
  return !!(myPrefs.ageMin || myPrefs.ageMax || myPrefs.country || myPrefs.ethnicity || myPrefs.nationality);
}
