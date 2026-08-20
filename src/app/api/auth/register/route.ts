import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth/service';
import { createSessionToken } from '@/lib/auth/session';
import { Role } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const { email, password, name, role } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    const assignedRole = role && Object.values(Role).includes(role) ? role : Role.PATIENT;
    const user = await registerUser(email, password, name, assignedRole);

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json({
      message: 'Registration successful',
      user,
    }, { status: 201 });

    response.cookies.set('carepulse_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 400 });
  }
}
