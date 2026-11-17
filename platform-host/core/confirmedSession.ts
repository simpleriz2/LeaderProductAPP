import type {ConfirmedSession} from './sessionCoordinator';
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
export function snapshotConfirmedSession(value:unknown):ConfirmedSession{
  const session=value as ConfirmedSession;
  if(!session||!identifier(session.company)||!identifier(session.user)||!identifier(session.confirmation)||!Array.isArray(session.modules)||session.modules.length>128||!session.modules.every(identifier)||new Set(session.modules).size!==session.modules.length)throw Error('Invalid confirmed session');
  return Object.freeze({company:session.company,user:session.user,confirmation:session.confirmation,modules:Object.freeze([...session.modules])});
}
