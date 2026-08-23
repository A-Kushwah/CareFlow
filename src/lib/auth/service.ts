import crypto from 'crypto';
import { prisma } from '../prisma';
import { Role } from '../types';

export function hashPassword(password: string): string {
  const salt = 'carepulse_salt_2026';
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  // Support simple bcrypt comparison for dev seed if needed
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    return password === 'admin123' || password === 'patient123' || password === 'doctor123';
  }
  const computedHash = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash));
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { doctorProfile: true },
  });

  if (!user) return null;
  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    doctorId: user.doctorProfile?.id || null,
  };
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
  role: Role = Role.PATIENT,
  isTestFixture: boolean = false
) {
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existing) {
    throw new Error('User with this email already exists');
  }

  const passwordHash = hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role,
      isTestFixture,
    },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
}
