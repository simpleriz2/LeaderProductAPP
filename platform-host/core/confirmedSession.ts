import type { ConfirmedSession } from './sessionCoordinator';
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
export function snapshotConfirmedSession(value: unknown): ConfirmedSession {
  const session = value as ConfirmedSession;
  if (
    !session ||
    !identifier(session.company) ||
    !identifier(session.user) ||
    !identifier(session.confirmation) ||
    !Array.isArray(session.modules) ||
    session.modules.length > 128 ||
    !session.modules.every(identifier) ||
    new Set(session.modules).size !== session.modules.length
  )
    throw Error('Invalid confirmed session');
  let permissions: ConfirmedSession['permissions'];
  if (session.permissions !== undefined) {
    const matrix = session.permissions;
    if (
      !matrix ||
      typeof matrix !== 'object' ||
      Array.isArray(matrix) ||
      Object.keys(matrix).length !== session.modules.length ||
      Object.keys(matrix).some(module => !session.modules.includes(module))
    )
      throw Error('Invalid action grants');
    const entries = session.modules.map(module => {
      const actions = matrix[module];
      if (
        !Object.hasOwn(matrix, module) ||
        !Array.isArray(actions) ||
        actions.length > 128 ||
        !actions.every(identifier) ||
        new Set(actions).size !== actions.length
      )
        throw Error('Invalid action grants');
      return [module, Object.freeze([...actions])] as const;
    });
    permissions = Object.freeze(Object.fromEntries(entries));
  }
  return Object.freeze({
    ...(permissions === undefined ? {} : { permissions }),
    company: session.company,
    user: session.user,
    confirmation: session.confirmation,
    modules: Object.freeze([...session.modules]),
  });
}

/** Missing action confirmation grants NOTHING. Module entitlement alone is not an action permission. */
export function hasSessionAction(
  session: ConfirmedSession,
  module: string,
  action: string,
): boolean {
  return (
    session.modules.includes(module) &&
    !!session.permissions &&
    Object.hasOwn(session.permissions, module) &&
    Array.isArray(session.permissions[module]) &&
    session.permissions[module].includes(action)
  );
}
