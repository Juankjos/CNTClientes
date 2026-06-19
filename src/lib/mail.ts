// src/lib/mail.ts
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
  throw new Error('Faltan variables SMTP_* o MAIL_FROM');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendVerificationEmail(
  to: string,
  username: string,
  verifyUrl: string
) {
  const safeUsername = escapeHtml(username);

  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject: 'Verifica tu correo — Noticias CNT',
    html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Hola, ${safeUsername}</h2>
        <p>Gracias por registrarte en Noticias CNT.</p>
        <p>Para activar tu cuenta, verifica tu correo con el siguiente botón:</p>
        <p>
          <a href="${verifyUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px;">
            Verificar correo
          </a>
        </p>
        <p>Si no solicitaste esta cuenta, ignora este mensaje.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  username: string,
  resetUrl: string
) {
  const safeUsername = escapeHtml(username);

  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject: 'Restablece tu contraseña — Noticias CNT',
    html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Hola, ${safeUsername}</h2>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px;">
            Restablecer contraseña
          </a>
        </p>
        <p>Este enlace expirará en 1 hora.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      </div>
    `,
  });
}