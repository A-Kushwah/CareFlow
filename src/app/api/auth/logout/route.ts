import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out successfully' });
  response.cookies.delete('careflow_session');
  response.cookies.delete('carepulse_session');
  return response;
}
