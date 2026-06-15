/**
 * Decides whether a bottom-nav item is the active one for the current path.
 * The "Add" item (/expenses/new) matches only on an exact path so that it
 * isn't lit up while browsing the expenses list; every other item matches by
 * prefix.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/expenses/new") {
    return pathname === "/expenses/new";
  }
  return pathname.startsWith(href);
}
