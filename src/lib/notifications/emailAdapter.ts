import nodemailer from 'nodemailer';

export async function sendEmailNotification(
  recipient: string,
  template: string,
  payload: any,
  idempotencyKey?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const provider = process.env.EMAIL_PROVIDER || 'console';
  const ik = idempotencyKey || `email_${Date.now()}`;

  if (provider === 'console') {
    console.log(`[EMAIL OUTBOX CONSOLE DEMO] To: ${recipient} | Template: ${template} | IdempotencyKey: ${ik}`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));
    return { success: true, messageId: `mock-msg-${ik}` };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });

    const info = await transporter.sendMail({
      from: '"CareFlow Healthcare" <no-reply@careflow.com>',
      to: recipient,
      subject: `[CareFlow] Notification: ${template}`,
      headers: {
        'X-Idempotency-Key': ik,
      },
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0284c7;">CareFlow Healthcare Notification</h2>
          <p>Template: <strong>${template}</strong></p>
          <p style="font-size: 11px; color: #666;">Idempotency Key: <code>${ik}</code></p>
          <pre style="background: #f4f4f5; padding: 15px; border-radius: 8px;">${JSON.stringify(payload, null, 2)}</pre>
          <p style="font-size: 12px; color: #888;">This is an automated system message.</p>
        </div>
      `,
    });

    return { success: true, messageId: info.messageId || `msg_${ik}` };
  } catch (error: any) {
    return { success: false, error: error.message || 'SMTP transmission error' };
  }
}
