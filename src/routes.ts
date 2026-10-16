import type { Role } from '../shared/domain.ts'

export const routes = { game: '/', parents: '/parents', calendar: '/parents/calendar', inbox: '/parents/inbox' }
export type ParentView = 'dashboard' | 'calendar' | 'inbox'

const parentViews = new Map<string, ParentView>([[routes.parents, 'dashboard'], [routes.calendar, 'calendar'], [routes.inbox, 'inbox']])
const normalized = (pathname: string) => pathname.replace(/\/+$/, '')

export function roleForPathname(pathname: string): Role {
  return parentViews.has(normalized(pathname)) ? 'parent' : 'child'
}

export function parentViewForPathname(pathname: string): ParentView {
  return parentViews.get(normalized(pathname)) ?? 'dashboard'
}
