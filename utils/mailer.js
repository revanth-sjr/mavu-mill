const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null; // Not configured yet - will fallback to console log
  }

  // If using Gmail or generic SMTP
  if (host.includes('gmail.com')) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  } else {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  return transporter;
}

/**
 * Send Login OTP Email
 * @param {string} toEmail 
 * @param {string} otp 
 * @param {string} [recipientName]
 * @returns {Promise<{ sent: boolean, devMode?: boolean, previewUrl?: string }>}
 */
async function sendOtpEmail(toEmail, otp, recipientName = 'User') {
  const mailer = getTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || '"சக்தி ஆலை (Sakthi Mill)" <no-reply@sakthimill.com>';

  const subject = `சக்தி ஆலை — உள்நுழைவு OTP குறியீடு / Login OTP: ${otp}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9f8; margin: 0; padding: 24px; color: #1c2e24; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e1e7e4; padding: 32px 28px; box-shadow: 0 4px 14px rgba(0,0,0,0.05); }
        .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; border-bottom: 1px dashed #d8e0dc; padding-bottom: 16px; }
        .brand-mark { width: 36px; height: 36px; background: #2a7a4c; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; text-align: center; line-height: 36px; }
        .brand-title { font-size: 16px; font-weight: 700; color: #1c2e24; }
        .brand-sub { font-size: 12px; color: #62756a; }
        .greeting { font-size: 15px; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #465a4e; margin-bottom: 20px; }
        .otp-box { background: #f0f7f3; border: 1.5px solid #2a7a4c; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2a7a4c; }
        .otp-sub { font-size: 12px; color: #62756a; margin-top: 6px; }
        .warning { font-size: 12px; color: #8a9e92; border-top: 1px solid #eef2f0; padding-top: 16px; margin-top: 24px; }
        .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #8a9e92; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">
          <div class="brand-mark">ச</div>
          <div>
            <div class="brand-title">சக்தி எண்ணெய் மற்றும் மாவு ஆலை</div>
            <div class="brand-sub">Sakthi Oil &amp; Flour Mill &middot; Billing Counter</div>
          </div>
        </div>

        <div class="greeting">வணக்கம் / Hello <strong>${recipientName}</strong>,</div>
        <p class="text">
          உங்கள் கணக்கில் உள்நுழைவதற்கான ஒருமுறை கடவுச்சொல் (OTP) கீழே உள்ளது:<br>
          Use the 6-digit one-time password below to sign in to your Sakthi Mill account:
        </p>

        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <div class="otp-sub">Validity: 10 minutes / 10 நிமிடங்கள் மட்டுமே செல்லுபடியாகும்</div>
        </div>

        <div class="warning">
          <strong>பாதுகாப்பு குறிப்பு:</strong> இந்த OTP-ஐ யாரிடமும் பகிர வேண்டாம். நீங்கள் இதை கோரவில்லை என்றால், இந்த மின்னஞ்சலைப் புறக்கணிக்கலாம்.<br>
          <em>Never share this OTP with anyone. If you did not request this, please ignore this email.</em>
        </div>
      </div>

      <div class="footer">
        &copy; ${new Date().getFullYear()} Sakthi Oil &amp; Flour Mill. All rights reserved.
      </div>
    </body>
    </html>
  `;

  if (!mailer) {
    console.log('\n======================================================');
    console.log('  [EMAIL OTP - DEVELOPMENT FALLBACK]');
    console.log(`  To:      ${toEmail} (${recipientName})`);
    console.log(`  OTP:     ${otp}`);
    console.log('  Notice:  Configure SMTP_USER & SMTP_PASS in .env to send real emails.');
    console.log('======================================================\n');
    return { sent: true, devMode: true, devOtp: otp };
  }

  try {
    await mailer.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      html,
      text: `சக்தி ஆலை — உங்கள் உள்நுழைவு OTP குறியீடு: ${otp}. (Validity: 10 minutes). Do not share this OTP.`
    });
    return { sent: true, devMode: false };
  } catch (err) {
    console.error('Failed to send OTP email via SMTP:', err.message);
    throw new Error('Could not send verification email: ' + err.message);
  }
}

/**
 * Send Customer Pickup Ready Notification via Email
 * @param {string} toEmail
 * @param {string} recipientName
 * @param {object} task
 */
async function sendTaskReadyEmail(toEmail, recipientName = 'Customer', task) {
  const mailer = getTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || '"சக்தி ஆலை (Sakthi Mill)" <no-reply@sakthimill.com>';

  const subject = `சக்தி ஆலை — உங்கள் அரைவை தயார் / Order Ready for Pickup (${task.tokenNo})`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9f8; margin: 0; padding: 24px; color: #1c2e24; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e1e7e4; padding: 32px 28px; box-shadow: 0 4px 14px rgba(0,0,0,0.05); }
        .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; border-bottom: 1px dashed #d8e0dc; padding-bottom: 16px; }
        .brand-mark { width: 36px; height: 36px; background: #2a7a4c; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; text-align: center; line-height: 36px; }
        .brand-title { font-size: 16px; font-weight: 700; color: #1c2e24; }
        .brand-sub { font-size: 12px; color: #62756a; }
        .status-badge { display: inline-block; background: #e8f5ee; color: #1f6b3e; padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 13px; margin-bottom: 16px; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
        .details-table td { padding: 8px 0; border-bottom: 1px dashed #eef2f0; }
        .details-table td.label { color: #62756a; }
        .details-table td.val { text-align: right; font-weight: 600; color: #1c2e24; }
        .total-row td { font-size: 16px; font-weight: 700; color: #2a7a4c; border-bottom: none; padding-top: 12px; }
        .callout { background: #f0f7f3; border-left: 4px solid #2a7a4c; padding: 12px 14px; border-radius: 4px; font-size: 13px; color: #1c2e24; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">
          <div class="brand-mark">ச</div>
          <div>
            <div class="brand-title">சக்தி எண்ணெய் மற்றும் மாவு ஆலை</div>
            <div class="brand-sub">Sakthi Oil &amp; Flour Mill</div>
          </div>
        </div>

        <div class="status-badge">&#10003; Ready for Pickup / தயார் நிலையில் உள்ளது</div>
        <div style="font-size:15px; margin-bottom:12px;">வணக்கம் / Hello <strong>${recipientName}</strong>,</div>
        <p style="font-size:14px; line-height:1.6; color:#465a4e;">
          உங்கள் அரைவை / பொருட்கள் வெற்றிகரமாக முடிந்து தயார் நிலையில் உள்ளது. தயவுசெய்து ஆலையில் வந்து பெற்றுக்கொள்ளவும்.<br>
          <em>Your order is ready for collection at our mill counter. Please present your token slip or phone number.</em>
        </p>

        <table class="details-table">
          <tr><td class="label">Token / டோக்கன்:</td><td class="val">${task.tokenNo}</td></tr>
          <tr><td class="label">Item / பொருள்:</td><td class="val">${task.productName}</td></tr>
          <tr><td class="label">Quantity / அளவு:</td><td class="val">${task.quantity} ${task.unit}</td></tr>
          <tr class="total-row"><td class="label">Total Amount / கட்டணம்:</td><td class="val">&#8377;${task.total}</td></tr>
        </table>

        <div class="callout">
          <strong>ஆலை முகவரி / Counter:</strong> சக்தி எண்ணெய் மற்றும் மாவு ஆலை.<br>
          நன்றி / Thank you!
        </div>
      </div>
    </body>
    </html>
  `;

  if (!mailer) {
    console.log('\n======================================================');
    console.log('  [TASK READY EMAIL - DEV FALLBACK]');
    console.log(`  To:      ${toEmail} (${recipientName})`);
    console.log(`  Task:    ${task.tokenNo} - ${task.productName} (Total: ₹${task.total})`);
    console.log('======================================================\n');
    return { sent: true, devMode: true };
  }

  try {
    await mailer.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      html,
      text: `சக்தி ஆலை: வணக்கம் ${recipientName}! உங்கள் ${task.productName} (Token: ${task.tokenNo}) தயார். கட்டணம்: ₹${task.total}. ஆலையில் வந்து பெற்றுக்கொள்ளவும்.`
    });
    return { sent: true, devMode: false };
  } catch (err) {
    console.error('Failed to send task ready email:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  sendOtpEmail,
  sendTaskReadyEmail
};

