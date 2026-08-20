import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth/service';
import { createSession } from '@/lib/auth/session';
import { Role } from '@/lib/types';
import { z } from 'zod';

const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = RegisterSchema.parse(body);

    // SECURITY ENFORCEMENT: Server hardcodes Role.PATIENT for public self-registration.
    // Client-supplied role parameters are strictly ignored to prevent privilege escalation.
    const user = await registerUser(
      validated.email,
      validated.password,
      validated.name,
      Role.PATIENT
    );

    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message || 'Validation error' }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Registration failed' }, { status: 400 });
  }
}
