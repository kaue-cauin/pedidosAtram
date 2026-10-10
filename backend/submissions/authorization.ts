import type { Principal } from '../auth/service.ts';
import { uuid } from '../auth/service.ts';
import { fail } from '../security/errors.ts';
// Principal must originate from AuthService. SQL revalidates session/membership/owner under lock.
export function principalSession(p:Principal) {if(!uuid(p.sessionId)||!uuid(p.userId)||!uuid(p.organizationId))fail('UNAUTHENTICATED',401);return p.sessionId;}
