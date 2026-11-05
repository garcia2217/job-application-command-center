export const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/applications', label: 'Applications', icon: 'applications' },
  { href: '/companies', label: 'Companies', icon: 'companies' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
] as const

export type NavIcon = (typeof NAV_ITEMS)[number]['icon']

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

// '/' matches only '/', others match their prefix at a segment boundary
export function isActive(href: string, pathname: string): boolean {
  const path = normalize(pathname)
  if (href === '/') return path === '/'
  return path === href || path.startsWith(`${href}/`)
}

const OWN_PRIMARY = [
  /^\/applications\/[^/]+(\/edit)?$/, // new, detail (Compare), edit
  /^\/(companies|contacts)\/new$/,
  /^\/(companies|contacts)\/[^/]+\/edit$/,
  /^\/settings$/,
]

// Screens with their own primary action render the top-bar "Add application" as secondary
export function hasOwnPrimary(pathname: string): boolean {
  const path = normalize(pathname)
  return OWN_PRIMARY.some((pattern) => pattern.test(path))
}
