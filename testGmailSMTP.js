import nodemailer from 'nodemailer';

async function testGmailSMTP() {
  const user = 'exploretamizhagam@gmail.com';
  const pass = 'kanlmqsvgbxnwfbo';

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: user,
      pass: pass
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"Explore Tamil Nadu Tourism" <${user}>`,
      to: 'exploretamizhagam@gmail.com',
      subject: '🌴 Real Email Test - Explore Tamil Nadu',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; background: #f9f5f2; border-radius: 12px; border: 1px solid #242429;">
          <h2 style="color: #242429;">Explore Tamil Nadu Direct Gmail Delivery</h2>
          <p>Gmail SMTP has been connected with your Google App Password!</p>
          <div style="font-size: 28px; font-weight: bold; color: #ffffff; background: #242429; padding: 12px 24px; display: inline-block; border-radius: 8px;">
            123456
          </div>
        </div>
      `
    });

    console.log('✅ GMAIL SMTP DISPATCH SUCCESSFUL!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (err) {
    console.error('❌ GMAIL SMTP ERROR:', err);
  }
}

testGmailSMTP();
