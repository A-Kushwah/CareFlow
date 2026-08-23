import { NextResponse } from 'next/server';
import { getSession } from './session';
import { Role } from '../types';

export async function requireAuth(allowedRoles?: Role[], req?: Request) {
  const session = await getSession(req);
  if (!session) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 }), session: null };
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden. Insufficient permissions.' }, { status: 403 }), session };
  }

  return { errorResponse: null, session };
}
