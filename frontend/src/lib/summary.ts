// Page-header summary lines (DESIGN_GUIDE §4): factual, from real counts, never stat tiles.

function quietHalf(count: number): string {
  return count === 1 ? '1 application has gone quiet' : `${count} applications have gone quiet`
}

function upcomingHalf(count: number): string {
  return count === 1 ? '1 interview in the next 7 days' : `${count} interviews in the next 7 days`
}

/** Home subtitle; a zero half is omitted, and no line at all when both are zero. */
export function homeSubtitle(quiet: number, upcoming: number): string | null {
  const halves = [quiet > 0 && quietHalf(quiet), upcoming > 0 && upcomingHalf(upcoming)].filter(Boolean)
  return halves.length ? halves.join(' · ') : null
}

export function applicationsSubtitle(total: number, quiet: number): string {
  const head = total === 1 ? '1 application' : `${total} applications`
  return quiet > 0 ? `${head} · ${quiet} quiet` : head
}
