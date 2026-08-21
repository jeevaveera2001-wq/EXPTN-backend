import nodemailer from 'nodemailer';

async function testGmailToAnyAddress() {
  const user = 'exploretamizhagam@gmail.com';
  const pass = 'kanlmqsvgbxnwfbo';

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });

  try {
    const info = await transporter.sendMail({
      from: `"Explore Tamil Nadu Tourism" <${user}>`,
      to: 'anitha.traveler.tamilnadu@gmail.com',
      subject: '🔐 Your 6-Digit Explore Tamil Nadu Verification Code: 482910',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; background: #f9f5f2; border-radius: 12px; border: 1px solid #242429;">
          <h2 style="color: #242429;">Explore Tamil Nadu Verification</h2>
          <p>Your 6-digit verification code is: <strong>482910</strong></p>
        </div>
      `
    });

    console.log('✅ UNIVERSAL GMAIL SMTP SEND SUCCESSFUL!');
    console.log('Recipient:', 'anitha.traveler.tamilnadu@gmail.com');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (err) {
    console.error('❌ GMAIL SMTP ERROR:', err);
  }
}

testGmailToAnyAddress();
