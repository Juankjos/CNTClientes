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

export async function sendVerificationEmail(to: string, username: string, verifyUrl: string) {
  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject: 'Verifica tu correo — CNT Clientes',
    html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5;">
        <h2>Hola, ${username}</h2>
        <p>Gracias por registrarte en CNT Clientes.</p>
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