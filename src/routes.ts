import type { Role } from '../shared/domain.ts'

export const routes = { game: '/', parents: '/parents', inbox: '/parents/inbox' }
export type ParentView = 'dashboard' | 'inbox'

const normalized = (pathname: string) => pathname.replace(/\/+$/, '')

export function roleForPathname(pathname: string): Role {
  return normalized(pathname) === routes.parents || normalized(pathname) === routes.inbox ? 'parent' : 'child'
}

export function parentViewForPathname(pathname: string): ParentView {
  return normalized(pathname) === routes.inbox ? 'inbox' : 'dashboard'
}
