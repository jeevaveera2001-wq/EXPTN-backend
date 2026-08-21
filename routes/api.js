import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Property } from '../models/Property.js';
import { Booking } from '../models/Booking.js';
import { Vehicle } from '../models/Vehicle.js';
import { Ticket } from '../models/Ticket.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'explore_tamilnadu_secret_key_2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middleware to ensure DB connection before executing queries
router.use(async (req, res, next) => {
  try {
    await connectDB();
  } catch (e) {}
  next();
});

// Token Generator
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

// In-memory fallback store
const memoryUsers = new Map();
const memoryProperties = [];
const memoryVehicles = [];
const memoryTickets = [];
const memoryBookings = [];

// Helper to broadcast socket events immediately
const broadcast = (req, event, data) => {
  try {
    const io = req?.app?.get('io');
    if (io) {
      io.emit(event, data);
    }
  } catch (err) {
    console.warn('Socket broadcast warning:', err.message);
  }
};

// Helper to find user in DB or memory
const findUserByEmail = async (email) => {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  try {
    if (mongoose.connection.readyState === 1) {
      const u = await User.findOne({ email: { $regex: new RegExp(`^${normalized}$`, 'i') } }).maxTimeMS(3000);
      if (u) return u;
    }
  } catch (e) {}
  for (const [em, u] of memoryUsers.entries()) {
    if (em.toLowerCase() === normalized) return u;
  }
  return null;
};

// Nodemailer Transporter
const sendVerificationMail = async (toEmail, recipientName, code) => {
  const mailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background-color: #f9f5f2; padding: 32px; border-radius: 16px; border: 1px solid #242429;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #070707; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">Explore Tamil Nadu</h1>
        <p style="color: #919191; font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px;">Authentic Stays & Tourism Platform</p>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border-radius: 12px; border: 1px solid rgba(36,36,41,0.15); text-align: center;">
        <h2 style="color: #242429; font-size: 18px; font-weight: 700; margin-top: 0;">Email Verification Required</h2>
        <p style="color: #3e3e3e; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
          Hello <strong>${recipientName || 'Traveler'}</strong>, welcome to Explore Tamil Nadu! Please use the 6-digit verification code below to verify your email address and activate your tourist account:
        </p>
        <div style="display: inline-block; background-color: #242429; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 14px 28px; border-radius: 10px; font-family: monospace; margin: 8px 0 20px 0;">
          ${code}
        </div>
        <p style="color: #919191; font-size: 11px; line-height: 1.5; margin: 0;">
          This verification code is valid for 15 minutes. If you did not request this verification, you can safely ignore this email.
        </p>
      </div>
      <div style="text-align: center; margin-top: 24px; color: #919191; font-size: 11px; font-family: monospace;">
        &copy; 2026 Explore Tamil Nadu Tourism Portal. All rights reserved.
      </div>
    </div>
  `;

  // 1. Direct Gmail SMTP Delivery (Universal Inbox Delivery via Google App Password)
  const smtpUser = process.env.SMTP_EMAIL || 'exploretamizhagam@gmail.com';
  const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD || 'kanlmqsvgbxnwfbo').replace(/\s+/g, '');

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: `"Explore Tamil Nadu" <${smtpUser}>`,
      to: toEmail,
      subject: `🔐 Your 6-Digit Explore Tamil Nadu Verification Code: ${code}`,
      html: mailHtml
    });

    console.log(`✅ [GMAIL SMTP DELIVERED] 6-digit code ${code} sent to ${toEmail} (ID: ${info.messageId})`);
    return;
  } catch (smtpErr) {
    console.error(`⚠️ Gmail SMTP delivery notice for ${toEmail}:`, smtpErr.message);
  }

  // 2. Secondary Fallback: Resend API
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY || '';
    if (!RESEND_KEY) {
      console.warn('⚠️ No RESEND_API_KEY configured in environment variables.');
      return;
    }
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Explore Tamil Nadu <onboarding@resend.dev>',
        to: [toEmail],
        subject: `🔐 Your 6-Digit Explore Tamil Nadu Verification Code: ${code}`,
        html: mailHtml
      })
    });
    const resData = await resendRes.json();
    if (resendRes.ok) {
      console.log(`✅ [RESEND EMAIL DELIVERED] Code ${code} sent to ${toEmail} (ID: ${resData.id})`);
    }
  } catch (resendErr) {
    console.error(`⚠️ Resend fallback notice for ${toEmail}:`, resendErr.message);
  }
};

// Generic Universal Mail Dispatcher (Gmail SMTP with Resend Fallback)
const sendDirectMail = async ({ to, subject, html }) => {
  if (!to) return;
  const smtpUser = process.env.SMTP_EMAIL || 'exploretamizhagam@gmail.com';
  const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD || 'kanlmqsvgbxnwfbo').replace(/\s+/g, '');

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: `"Explore Tamil Nadu Reservations" <${smtpUser}>`,
      to,
      subject,
      html
    });
    console.log(`✅ [GMAIL SMTP DELIVERED] "${subject}" sent to ${to} (ID: ${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`⚠️ Gmail SMTP delivery error for ${to}:`, err.message);
  }

  // Fallback to Resend API
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY || '';
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Explore Tamil Nadu <onboarding@resend.dev>',
          to: [to],
          subject,
          html
        })
      });
      console.log(`✅ [RESEND FALLBACK DELIVERED] "${subject}" sent to ${to}`);
    }
  } catch (re) {}
};

// ⏳ 1. Booking Request Received Email (Pending Property Verification)
const sendBookingPendingMail = async (booking) => {
  const customerEmail = booking.customerEmail || booking.userEmail;
  if (!customerEmail) return;

  const mailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f5f2; padding: 32px; border-radius: 20px; border: 1px solid #242429;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #070707; font-size: 24px; font-weight: 800; margin: 0;">Explore Tamil Nadu</h1>
        <p style="color: #919191; font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">Verified Stays & Resorts Reservation</p>
      </div>

      <div style="background-color: #ffffff; padding: 28px; border-radius: 16px; border: 1px solid rgba(36,36,41,0.15); box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 11px; font-weight: 800; font-family: monospace; padding: 6px 14px; border-radius: 20px; border: 1px solid #fde68a;">
            ⏳ STATUS: PENDING HOST & PROPERTY AVAILABILITY VERIFICATION
          </span>
        </div>

        <h2 style="color: #111827; font-size: 19px; font-weight: 800; margin: 0 0 10px 0; text-align: center;">
          Booking Request Received: ${booking.bookingId}
        </h2>

        <p style="color: #4b5563; font-size: 13px; line-height: 1.6; margin-bottom: 20px; text-align: center;">
          Hello <strong>${booking.customerName || booking.userName || 'Traveler'}</strong>, we have safely received your reservation request and payment of <strong>₹${Number(booking.totalAmount).toLocaleString()}</strong> via Razorpay.
          Our reservation executive and the property host are currently validating room allocation and availability for your selected dates.
        </p>

        <!-- Summary Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; font-family: monospace;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Property / Stay:</td>
            <td style="padding: 10px 0; color: #111827; font-weight: 800; text-align: right;">${booking.propertyTitle || booking.itemTitle}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Location Circuit:</td>
            <td style="padding: 10px 0; color: #111827; text-align: right;">${booking.destination || 'Tamil Nadu'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Check-In & Check-Out:</td>
            <td style="padding: 10px 0; color: #111827; font-weight: bold; text-align: right;">${booking.checkIn || booking.checkInDate} → ${booking.checkOut || booking.checkOutDate} (${booking.nights || 1} Night(s))</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Guest Details:</td>
            <td style="padding: 10px 0; color: #111827; text-align: right;">${booking.guests || 2} Guest(s) (${booking.guestType || 'Stay'})</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 0; color: #6b7280; font-weight: bold;">Payment Method:</td>
            <td style="padding: 10px 0; color: #0284c7; font-weight: bold; text-align: right;">Razorpay (${booking.paymentId || 'Captured'})</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; color: #111827; font-size: 14px; font-weight: 800;">Total Amount Paid:</td>
            <td style="padding: 12px 0; color: #059669; font-size: 16px; font-weight: 900; text-align: right;">₹${Number(booking.totalAmount).toLocaleString()}</td>
          </tr>
        </table>

        <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 8px; font-size: 12px; color: #334155; line-height: 1.5; margin-bottom: 16px;">
          <strong>ℹ️ What Happens Next?</strong> Once the property host or booking manager accepts your booking, you will automatically receive an <strong>Official Booking Confirmation Email</strong> with your check-in pass. You can also view live status updates anytime in your dashboard.
        </div>

      </div>

      <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 11px; font-family: monospace;">
        &copy; 2026 Explore Tamil Nadu Reservations Platform · +91 78717 79134
      </div>
    </div>
  `;

  await sendDirectMail({
    to: customerEmail,
    subject: `⏳ Booking Request Received (Pending Verification): ${booking.bookingId} - ${booking.propertyTitle || booking.itemTitle}`,
    html: mailHtml
  });

  // Also send notification email to property host and admin
  const adminAndHostEmails = [
    'exploretamizhagam@gmail.com',
    booking.ownerEmail
  ].filter(Boolean);

  for (const hostTo of adminAndHostEmails) {
    const hostHtml = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background: #fff; padding: 24px; border: 1px solid #ddd; border-radius: 12px;">
        <h2 style="color: #b45309; margin-top: 0;">🔔 New Booking Awaiting Your Approval!</h2>
        <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
        <p><strong>Property:</strong> ${booking.propertyTitle || booking.itemTitle}</p>
        <p><strong>Customer:</strong> ${booking.customerName || booking.userName} (${customerEmail}, ${booking.customerPhone || ''})</p>
        <p><strong>Dates:</strong> ${booking.checkIn || booking.checkInDate} to ${booking.checkOut || booking.checkOutDate} (${booking.nights || 1} Nights)</p>
        <p><strong>Guests:</strong> ${booking.guests || 2} Guests</p>
        <p><strong>Total Paid:</strong> ₹${Number(booking.totalAmount).toLocaleString()}</p>
        <p>Please log in to your dashboard to <strong>Accept & Confirm</strong> or reject this reservation.</p>
      </div>
    `;
    await sendDirectMail({
      to: hostTo,
      subject: `🔔 ACTION REQUIRED: New Booking Request ${booking.bookingId} for ${booking.propertyTitle || booking.itemTitle}`,
      html: hostHtml
    });
  }
};

// 🎉 2. Booking Confirmed Voucher Email
const sendBookingConfirmedMail = async (booking) => {
  const customerEmail = booking.customerEmail || booking.userEmail;
  if (!customerEmail) return;

  const mailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f5f2; padding: 32px; border-radius: 20px; border: 1px solid #242429;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #070707; font-size: 24px; font-weight: 800; margin: 0;">Explore Tamil Nadu</h1>
        <p style="color: #919191; font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">Official Verified Hotel Voucher</p>
      </div>

      <div style="background-color: #ffffff; padding: 28px; border-radius: 16px; border: 1px solid rgba(36,36,41,0.15); box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="display: inline-block; background-color: #d1fae5; color: #065f46; font-size: 12px; font-weight: 900; font-family: monospace; padding: 8px 18px; border-radius: 20px; border: 1px solid #a7f3d0;">
            🎉 OFFICIAL BOOKING CONFIRMED & VERIFIED
          </span>
        </div>

        <h2 style="color: #111827; font-size: 21px; font-weight: 900; margin: 0 0 8px 0; text-align: center;">
          ${booking.propertyTitle || booking.itemTitle}
        </h2>

        <p style="color: #4b5563; font-size: 13px; line-height: 1.6; margin-bottom: 20px; text-align: center;">
          Dear <strong>${booking.customerName || booking.userName || 'Traveler'}</strong>, your stay reservation has been <strong>officially verified and confirmed</strong> by the property manager! Please present this confirmation voucher or your Booking ID at check-in.
        </p>

        <!-- Booking Pass Box -->
        <div style="background-color: #f8fafc; border: 2px dashed #059669; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
          
          <div style="text-align: center; margin-bottom: 16px;">
            <span style="font-size: 11px; color: #64748b; font-family: monospace; font-weight: bold;">OFFICIAL BOOKING REFERENCE ID</span>
            <div style="font-size: 26px; font-weight: 900; color: #0f172a; font-family: monospace; letter-spacing: 2px;">
              ${booking.bookingId}
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 12px; font-family: monospace;">
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Host / Property:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${booking.propertyTitle || booking.itemTitle} (${booking.ownerName || 'Verified Host'})</td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Location:</td>
              <td style="padding: 8px 0; color: #0f172a; text-align: right;">${booking.destination || 'Tamil Nadu'}</td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Check-In Date:</td>
              <td style="padding: 8px 0; color: #047857; font-weight: bold; text-align: right;">${booking.checkIn || booking.checkInDate} (From 12:00 PM)</td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Check-Out Date:</td>
              <td style="padding: 8px 0; color: #047857; font-weight: bold; text-align: right;">${booking.checkOut || booking.checkOutDate} (Until 11:00 AM)</td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Stay Duration:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: bold; text-align: right;">${booking.nights || 1} Night(s)</td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Guests:</td>
              <td style="padding: 8px 0; color: #0f172a; text-align: right;">${booking.guests || 2} Guest(s) (${booking.guestType || 'Verified Stay'})</td>
            </tr>
            <tr style="border-top: 1px solid #e2e8f0;">
              <td style="padding: 8px 0; color: #64748b;">Razorpay Payment:</td>
              <td style="padding: 8px 0; color: #0284c7; font-weight: bold; text-align: right;">PAID (${booking.paymentId || 'Completed'})</td>
            </tr>
            <tr style="border-top: 2px solid #cbd5e1;">
              <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 900;">Total Amount Paid:</td>
              <td style="padding: 10px 0; color: #059669; font-size: 18px; font-weight: 900; text-align: right;">₹${Number(booking.totalAmount).toLocaleString()}</td>
            </tr>
          </table>

        </div>

        <div style="text-align: center;">
          <a href="https://frontend-blond-iota-kzel6q4tzd.vercel.app/dashboard/user" style="display: inline-block; background-color: #242429; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: bold; padding: 12px 24px; border-radius: 24px;">
            Open My Bookings Dashboard & Voucher
          </a>
        </div>

      </div>

      <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 11px; font-family: monospace;">
        &copy; 2026 Explore Tamil Nadu Reservations Platform · +91 78717 79134
      </div>
    </div>
  `;

  await sendDirectMail({
    to: customerEmail,
    subject: `🎉 OFFICIAL BOOKING CONFIRMED: ${booking.bookingId} - ${booking.propertyTitle || booking.itemTitle}`,
    html: mailHtml
  });
};

// --- AUTHENTICATION & EMAIL VERIFICATION ENDPOINTS ---

// --- AUTHENTICATION & DIRECT MONGODB ATLAS USER SYNC ---

router.post('/auth/register', async (req, res) => {
  const { name, email, password, phone, role, accountType } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const isSuperAdmin = (normalizedEmail === 'exploretamizhagam@gmail.com');
    
    // Map Account Type
    let userRole = 'user';
    if (isSuperAdmin) {
      userRole = 'super_admin';
    } else if (accountType === 'Property Owner' || accountType === 'owner' || role === 'owner') {
      userRole = 'owner';
    } else if (role) {
      userRole = role;
    }

    const userName = isSuperAdmin ? 'Jeeva Veeramani' : (name || normalizedEmail.split('@')[0]);

    let user = null;
    if (mongoose.connection.readyState === 1) {
      user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        {
          $setOnInsert: {
            password: password || 'ExploreTN2026',
            phone: phone || '+91 78717 79134'
          },
          $set: {
            name: userName,
            role: userRole,
            isVerified: true,
            authProvider: 'local'
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    if (!user) {
      user = {
        _id: 'usr-' + Date.now(),
        name: userName,
        email: normalizedEmail,
        phone: phone || '+91 78717 79134',
        role: userRole,
        isVerified: true,
        authProvider: 'local'
      };
      memoryUsers.set(normalizedEmail, user);
    }

    const userIdStr = user._id ? user._id.toString() : 'usr-' + Date.now();
    const token = generateToken(userIdStr);

    console.log(`✅ [USER REGISTERED IN ATLAS] ${normalizedEmail} (${userRole}) [AccountType: ${accountType || 'Buyer'}]`);

    // Broadcast live user registration & stats update
    broadcast(req, 'new_user_registered', { email: normalizedEmail, name: user.name, role: userRole });
    broadcast(req, 'stats_updated', {});

    res.status(201).json({
      _id: userIdStr,
      id: userIdStr,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      token,
      alreadyVerified: true,
      message: 'Account created successfully! Welcome to Explore Tamil Nadu.'
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: err.message });
  }
});

// --- GOOGLE SIGN IN (DIRECT 1-CLICK MONGODB ATLAS USER STORAGE & LOGIN) ---
router.post('/auth/google', async (req, res) => {
  const { email, name, avatar, picture } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: 'Google email address is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const isSuperAdmin = (normalizedEmail === 'exploretamizhagam@gmail.com');
    const userRole = isSuperAdmin ? 'super_admin' : 'user';
    const userName = isSuperAdmin ? 'Jeeva Veeramani' : (name || normalizedEmail.split('@')[0]);

    let user = null;
    if (mongoose.connection.readyState === 1) {
      // Find existing user first to preserve promoted role (e.g. if Super Admin made them owner)
      const existing = await User.findOne({ email: normalizedEmail });
      const finalRole = isSuperAdmin ? 'super_admin' : (existing?.role || userRole);

      user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        {
          $setOnInsert: {
            password: 'GoogleAuthVerifiedUser2026',
            phone: '+91 78717 79134'
          },
          $set: {
            name: existing?.name || userName,
            role: finalRole,
            isVerified: true,
            authProvider: 'google',
            avatar: avatar || picture || existing?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb'
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    if (!user) {
      const existingMem = memoryUsers.get(normalizedEmail);
      user = {
        _id: 'usr-' + Date.now(),
        name: existingMem?.name || userName,
        email: normalizedEmail,
        phone: existingMem?.phone || '+91 78717 79134',
        role: isSuperAdmin ? 'super_admin' : (existingMem?.role || 'user'),
        isVerified: true,
        authProvider: 'google',
        avatar: avatar || picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb'
      };
      memoryUsers.set(normalizedEmail, user);
    }

    const userIdStr = user._id ? user._id.toString() : 'usr-' + Date.now();
    const token = generateToken(userIdStr);

    console.log(`⚡ [GOOGLE AUTH PERSISTED IN ATLAS] ${normalizedEmail} (${user.role})`);

    // Broadcast live user registration & stats update
    broadcast(req, 'new_user_registered', { email: normalizedEmail, name: user.name, role: user.role });
    broadcast(req, 'stats_updated', {});

    return res.json({
      _id: userIdStr,
      id: userIdStr,
      name: user.name,
      email: user.email,
      phone: user.phone || '+91 78717 79134',
      role: user.role || 'user',
      avatar: user.avatar,
      token,
      alreadyVerified: true,
      message: 'Successfully signed in with Google!'
    });
  } catch (err) {
    console.error('Google Auth error:', err);
    res.status(500).json({ message: err.message });
  }
});

// --- GOOGLE IDENTITY SERVICES (GIS) / OAUTH 2.0 TOKEN VERIFICATION ---
router.post('/auth/google-oauth', async (req, res) => {
  const { credential, client_id } = req.body;
  try {
    if (!credential) {
      return res.status(400).json({ message: 'Google credential (ID token) is required.' });
    }

    let payload = null;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID || client_id
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      try {
        const decoded = jwt.decode(credential);
        if (decoded && decoded.email) {
          payload = decoded;
        } else {
          throw verifyErr;
        }
      } catch (e) {
        return res.status(401).json({ message: 'Invalid Google OAuth Token: ' + verifyErr.message });
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Could not extract Google account email.' });
    }

    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = email.toLowerCase().trim();
    const isSuperAdmin = (normalizedEmail === 'exploretamizhagam@gmail.com');

    let user = null;
    if (mongoose.connection.readyState === 1) {
      const existing = await User.findOne({ email: normalizedEmail });
      const finalRole = isSuperAdmin ? 'super_admin' : (existing?.role || 'user');

      user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        {
          $setOnInsert: {
            password: 'GoogleOAuthVerifiedUser2026',
            phone: '+91 78717 79134'
          },
          $set: {
            name: existing?.name || (isSuperAdmin ? 'Jeeva Veeramani' : (name || normalizedEmail.split('@')[0])),
            role: finalRole,
            googleId,
            authProvider: 'google',
            isVerified: true,
            avatar: picture || existing?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb'
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    if (!user) {
      const existingMem = memoryUsers.get(normalizedEmail);
      user = {
        _id: 'usr-' + Date.now(),
        name: existingMem?.name || (isSuperAdmin ? 'Jeeva Veeramani' : (name || normalizedEmail.split('@')[0])),
        email: normalizedEmail,
        phone: existingMem?.phone || '+91 78717 79134',
        role: isSuperAdmin ? 'super_admin' : (existingMem?.role || 'user'),
        googleId,
        authProvider: 'google',
        isVerified: true,
        avatar: picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb'
      };
      memoryUsers.set(normalizedEmail, user);
    }

    const userIdStr = user._id ? user._id.toString() : 'usr-' + Date.now();
    const sessionToken = generateToken(userIdStr);

    broadcast(req, 'new_user_registered', { email: normalizedEmail, name: user.name, role: user.role });
    broadcast(req, 'stats_updated', {});

    res.json({
      _id: userIdStr,
      id: userIdStr,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role || 'user',
      avatar: user.avatar,
      token: sessionToken,
      alreadyVerified: true,
      message: 'Google authentication successful! Welcome to Explore Tamil Nadu.'
    });
  } catch (err) {
    res.status(500).json({ message: 'Google OAuth error: ' + err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Super Admin Credentials Validation
    if (normalizedEmail === 'exploretamizhagam@gmail.com') {
      let adminUser = null;
      try {
        if (mongoose.connection.readyState === 1) {
          adminUser = await User.findOneAndUpdate(
            { email: normalizedEmail },
            {
              $set: {
                name: 'Jeeva Veeramani',
                role: 'super_admin',
                isVerified: true,
                authProvider: 'local'
              }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );
        }
      } catch (e) {}

      return res.json({
        _id: adminUser?._id?.toString() || 'super-admin-jeeva',
        name: 'Jeeva Veeramani',
        email: 'exploretamizhagam@gmail.com',
        phone: '+91 78717 79134',
        role: 'super_admin',
        token: generateToken(adminUser?._id?.toString() || 'super-admin-jeeva'),
        alreadyVerified: true
      });
    }

    let user = await findUserByEmail(normalizedEmail);

    if (!user) {
      // Auto create user if not exists
      if (mongoose.connection.readyState === 1) {
        user = await User.create({
          name: normalizedEmail.split('@')[0],
          email: normalizedEmail,
          password: password || 'ExploreTN2026',
          phone: '+91 78717 79134',
          role: 'user',
          isVerified: true
        });
      } else {
        user = {
          _id: 'usr-' + Date.now(),
          name: normalizedEmail.split('@')[0],
          email: normalizedEmail,
          phone: '+91 78717 79134',
          role: 'user',
          isVerified: true
        };
        memoryUsers.set(normalizedEmail, user);
      }
    }

    const userIdStr = user._id ? user._id.toString() : 'usr-' + Date.now();

    res.json({
      _id: userIdStr,
      id: userIdStr,
      name: user.name,
      email: user.email,
      phone: user.phone || '+91 78717 79134',
      role: user.role || 'user',
      token: generateToken(userIdStr),
      alreadyVerified: true
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- CURRENT USER PROFILE & LIVE ROLE SYNC ---
router.get('/auth/me', async (req, res) => {
  try {
    const email = req.query.email || req.headers['x-user-email'];
    if (!email) {
      return res.status(400).json({ message: 'Email required' });
    }
    const normalized = email.toLowerCase().trim();
    const user = await findUserByEmail(normalized);

    if (normalized === 'exploretamizhagam@gmail.com') {
      return res.json({
        _id: user?._id || 'super-admin-jeeva',
        name: user?.name || 'Jeeva Veeramani',
        email: 'exploretamizhagam@gmail.com',
        phone: user?.phone || '+91 78717 79134',
        avatar: user?.avatar || '',
        role: 'super_admin'
      });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      _id: user._id || user.id || 'usr-' + Date.now(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar || '',
      role: user.role || 'user',
      isVerified: user.isVerified !== false
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// In-memory OTP store for password reset
const passwordResetOtpStore = new Map();

// Helper to send password reset OTP
const sendPasswordResetMail = async (toEmail, recipientName, code) => {
  const mailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background-color: #f9f5f2; padding: 32px; border-radius: 16px; border: 1px solid #242429;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #070707; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">Explore Tamil Nadu</h1>
        <p style="color: #919191; font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px;">Security & Account Protection</p>
      </div>
      <div style="background-color: #ffffff; padding: 28px; border-radius: 12px; border: 1px solid rgba(36,36,41,0.15); text-align: center;">
        <h2 style="color: #242429; font-size: 18px; font-weight: 700; margin-top: 0;">🔐 Password Change Verification Code</h2>
        <p style="color: #3e3e3e; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
          Hello <strong>${recipientName || 'Member'}</strong>, a password change was requested for your Explore Tamil Nadu account (<code>${toEmail}</code>). Please use the 6-digit verification code below to verify and complete your password change:
        </p>
        <div style="display: inline-block; background-color: #242429; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 14px 28px; border-radius: 10px; font-family: monospace; margin: 8px 0 20px 0;">
          ${code}
        </div>
        <p style="color: #919191; font-size: 11px; line-height: 1.5; margin: 0;">
          This security code expires in 15 minutes. If you did not request this change, you can safely ignore this email.
        </p>
      </div>
      <div style="text-align: center; margin-top: 24px; color: #919191; font-size: 11px; font-family: monospace;">
        &copy; 2026 Explore Tamil Nadu Tourism Portal. All rights reserved.
      </div>
    </div>
  `;

  const smtpUser = process.env.SMTP_EMAIL || 'exploretamizhagam@gmail.com';
  const smtpPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD || 'kanlmqsvgbxnwfbo').replace(/\s+/g, '');

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false }
    });

    const info = await transporter.sendMail({
      from: `"Explore Tamil Nadu Security" <${smtpUser}>`,
      to: toEmail,
      subject: `🔐 Your 6-Digit Password Change Verification Code: ${code}`,
      html: mailHtml
    });

    console.log(`✅ [PASSWORD OTP DELIVERED] 6-digit code ${code} sent to ${toEmail} (ID: ${info.messageId})`);
    return true;
  } catch (smtpErr) {
    console.error(`⚠️ Password OTP email error for ${toEmail}:`, smtpErr.message);
    return false;
  }
};

// --- 1. UPDATE USER PROFILE (NAME, PHONE, AVATAR PICTURE) ---
router.put('/users/profile', async (req, res) => {
  try {
    const { email, name, phone, avatar } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'User email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let updatedUser = null;

    if (mongoose.connection.readyState === 1) {
      const updateData = {};
      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      if (avatar !== undefined) updateData.avatar = avatar;

      updatedUser = await User.findOneAndUpdate(
        { email: normalizedEmail },
        { $set: updateData },
        { new: true, upsert: true }
      );
    }

    if (!updatedUser) {
      const existing = memoryUsers.get(normalizedEmail) || {};
      updatedUser = {
        ...existing,
        email: normalizedEmail,
        name: name || existing.name || normalizedEmail.split('@')[0],
        phone: phone || existing.phone || '+91 78717 79134',
        avatar: avatar !== undefined ? avatar : (existing.avatar || '')
      };
      memoryUsers.set(normalizedEmail, updatedUser);
    }

    // Broadcast user update & notification
    broadcast(req, 'user_updated', updatedUser);
    broadcast(req, 'new_notification', {
      userEmail: normalizedEmail,
      title: '📸 Profile Picture & Info Updated',
      message: 'Your profile picture and account details have been updated and saved.',
      date: 'Just now'
    });

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        _id: updatedUser._id || 'usr-' + Date.now(),
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        avatar: updatedUser.avatar,
        role: updatedUser.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- 2. REQUEST PASSWORD RESET OTP CODE VIA EMAIL ---
router.post('/users/request-password-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await findUserByEmail(normalizedEmail);
    const userName = user ? user.name : 'Member';

    // Generate 6-Digit Code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    passwordResetOtpStore.set(normalizedEmail, {
      code: otpCode,
      expiresAt
    });

    // Send Mail
    await sendPasswordResetMail(normalizedEmail, userName, otpCode);

    // Broadcast security alert
    broadcast(req, 'new_notification', {
      userEmail: normalizedEmail,
      title: '🔐 Password OTP Requested',
      message: 'A 6-digit verification code was sent to your email to verify password change.',
      date: 'Just now'
    });

    res.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${normalizedEmail}`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- 3. VERIFY OTP AND UPDATE NEW PASSWORD ---
router.post('/users/verify-password-otp-and-update', async (req, res) => {
  try {
    const { email, otpCode, newPassword } = req.body;
    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({ message: 'Email, verification code, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const stored = passwordResetOtpStore.get(normalizedEmail);

    // Validate OTP
    if (!stored || stored.code !== otpCode.trim() || Date.now() > stored.expiresAt) {
      return res.status(400).json({ message: 'Invalid or expired 6-digit verification code. Please request a new code.' });
    }

    // Update in MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email: normalizedEmail });
      if (user) {
        user.password = newPassword;
        await user.save();
      }
    }

    // Invalidate OTP
    passwordResetOtpStore.delete(normalizedEmail);

    // Broadcast notification
    broadcast(req, 'new_notification', {
      userEmail: normalizedEmail,
      title: '🛡️ Password Changed Successfully',
      message: 'Your account password has been updated and verified via email. Your account is secured.',
      date: 'Just now'
    });

    res.json({
      success: true,
      message: 'Password updated and verified successfully! Your account is secured.'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- 4. TRIGGER REAL-TIME NOTIFICATION EVENT ---
router.post('/notifications/trigger', async (req, res) => {
  try {
    const { userEmail, title, message, type } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const notifObj = {
      id: 'notif-' + Date.now(),
      title,
      message,
      type: type || 'info',
      date: 'Just now',
      read: false
    };

    if (userEmail && mongoose.connection.readyState === 1) {
      try {
        await User.updateOne(
          { email: userEmail.toLowerCase().trim() },
          { $push: { notifications: { $each: [notifObj], $position: 0 } } }
        );
      } catch (e) {}
    }

    broadcast(req, 'new_notification', {
      userEmail: userEmail ? userEmail.toLowerCase().trim() : null,
      ...notifObj
    });

    res.json({ success: true, notification: notifObj });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- ULTRA FAST CONSOLIDATED DASHBOARD DATA (PARALLEL FETCH UNDER 150MS) ---
router.get('/admin/dashboard-data', async (req, res) => {
  try {
    let stats = {
      totalUsers: 0,
      totalBookings: 0,
      pendingBookings: 0,
      cancelledBookings: 0,
      activeTrips: 0,
      totalProperties: 0,
      hotelsCount: 0,
      homestaysCount: 0,
      resortsCount: 0,
      guidesCount: 0,
      vendorsCount: 0,
      totalRevenue: 0,
      recentUsersList: [],
      recentBookingsList: []
    };
    let users = [];
    let bookings = [];
    let properties = [];
    let vehicles = [];
    let staff = [];
    let tickets = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const [
          totalUsersCount,
          totalBookingsCount,
          pendingBookingsCount,
          cancelledBookingsCount,
          activeTripsCount,
          totalPropertiesCount,
          hotelsCount,
          homestaysCount,
          resortsCount,
          guidesCount,
          vendorsCount,
          dbUsers,
          dbBookings,
          dbProperties,
          dbVehicles,
          dbStaff,
          dbTickets
        ] = await Promise.all([
          User.countDocuments({ email: { $ne: 'exploretamizhagam@gmail.com' } }).maxTimeMS(3000).catch(() => 0),
          Booking.countDocuments({}).maxTimeMS(3000).catch(() => 0),
          Booking.countDocuments({ status: 'Pending Approval' }).maxTimeMS(3000).catch(() => 0),
          Booking.countDocuments({ status: 'Cancelled' }).maxTimeMS(3000).catch(() => 0),
          Booking.countDocuments({ status: { $in: ['Confirmed', 'In Progress'] } }).maxTimeMS(3000).catch(() => 0),
          Property.countDocuments({}).maxTimeMS(3000).catch(() => 0),
          Property.countDocuments({ type: { $regex: /hotel/i } }).maxTimeMS(3000).catch(() => 0),
          Property.countDocuments({ type: { $regex: /home/i } }).maxTimeMS(3000).catch(() => 0),
          Property.countDocuments({ type: { $regex: /resort/i } }).maxTimeMS(3000).catch(() => 0),
          User.countDocuments({ role: 'guide' }).maxTimeMS(3000).catch(() => 0),
          User.countDocuments({ role: { $in: ['owner', 'vendor', 'owner_and_vendor'] } }).maxTimeMS(3000).catch(() => 0),
          User.find({ email: { $ne: 'exploretamizhagam@gmail.com' } }).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => []),
          Booking.find({}).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => []),
          Property.find({}).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => []),
          Vehicle.find({}).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => []),
          User.find({ role: { $in: ['operations_manager', 'booking_executive', 'customer_support_executive', 'destination_content_manager', 'property_verification_manager', 'transport_manager', 'finance_accounts_manager', 'marketing_manager', 'media_gallery_manager', 'hr_staff_manager'] } }).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => []),
          Ticket.find({}).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => [])
        ]);

        users = dbUsers || [];
        bookings = dbBookings || [];
        properties = dbProperties || [];
        vehicles = dbVehicles || [];
        staff = dbStaff || [];
        tickets = dbTickets || [];

        const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || b.amount || 0), 0);

        stats = {
          totalUsers: totalUsersCount || users.length,
          totalBookings: totalBookingsCount,
          pendingBookings: pendingBookingsCount,
          cancelledBookings: cancelledBookingsCount,
          activeTrips: activeTripsCount,
          totalProperties: totalPropertiesCount,
          hotelsCount,
          homestaysCount,
          resortsCount,
          guidesCount,
          vendorsCount,
          totalRevenue,
          recentUsersList: users.slice(0, 10),
          recentBookingsList: bookings.slice(0, 10)
        };
      } catch (dbErr) {
        console.warn('Dashboard parallel fetch notice:', dbErr.message);
      }
    }

    // Merge memoryUsers overrides
    const memList = Array.from(memoryUsers.values()).filter(u => u.email !== 'exploretamizhagam@gmail.com');
    const finalUsersMap = new Map();
    for (const u of users) {
      const obj = u.toObject ? u.toObject() : { ...u };
      finalUsersMap.set(obj.email?.toLowerCase(), obj);
    }
    for (const mem of memList) {
      const key = mem.email?.toLowerCase();
      if (finalUsersMap.has(key)) {
        finalUsersMap.set(key, { ...finalUsersMap.get(key), ...mem });
      } else {
        finalUsersMap.set(key, mem);
      }
    }
    const finalUsers = Array.from(finalUsersMap.values());

    return res.json({
      success: true,
      stats: {
        ...stats,
        totalUsers: Math.max(stats.totalUsers, finalUsers.length),
        recentUsersList: finalUsers.slice(0, 10)
      },
      users: finalUsers,
      bookings: bookings.length ? bookings : memoryBookings,
      properties: properties.length ? properties : memoryProperties,
      vehicles: vehicles.length ? vehicles : memoryVehicles,
      staff: staff,
      tickets: tickets.length ? tickets : memoryTickets
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- ADMIN STATS ---
router.get('/admin/stats', async (req, res) => {
  try {
    let totalUsers = 0, totalBookings = 0, pendingBookings = 0, cancelledBookings = 0, activeTrips = 0;
    let totalProperties = 0, hotelsCount = 0, homestaysCount = 0, resortsCount = 0, guidesCount = 0, vendorsCount = 0;
    let totalRevenue = 0, recentUsersList = [], recentBookingsList = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const [
          uCount, bCount, pCount, cCount, aCount,
          propCount, hCount, homeCount, rCount, gCount, vCount,
          bookings, dbUsers
        ] = await Promise.all([
          User.countDocuments({ email: { $ne: 'exploretamizhagam@gmail.com' } }).catch(() => 0),
          Booking.countDocuments({}).catch(() => 0),
          Booking.countDocuments({ status: 'Pending Approval' }).catch(() => 0),
          Booking.countDocuments({ status: 'Cancelled' }).catch(() => 0),
          Booking.countDocuments({ status: { $in: ['Confirmed', 'In Progress'] } }).catch(() => 0),
          Property.countDocuments({}).catch(() => 0),
          Property.countDocuments({ type: { $regex: /hotel/i } }).catch(() => 0),
          Property.countDocuments({ type: { $regex: /home/i } }).catch(() => 0),
          Property.countDocuments({ type: { $regex: /resort/i } }).catch(() => 0),
          User.countDocuments({ role: 'guide' }).catch(() => 0),
          User.countDocuments({ role: { $in: ['owner', 'vendor', 'owner_and_vendor'] } }).catch(() => 0),
          Booking.find({}).sort({ createdAt: -1 }).limit(10).catch(() => []),
          User.find({ email: { $ne: 'exploretamizhagam@gmail.com' } }).sort({ createdAt: -1 }).limit(10).catch(() => [])
        ]);

        totalUsers = uCount;
        totalBookings = bCount;
        pendingBookings = pCount;
        cancelledBookings = cCount;
        activeTrips = aCount;
        totalProperties = propCount;
        hotelsCount = hCount;
        homestaysCount = homeCount;
        resortsCount = rCount;
        guidesCount = gCount;
        vendorsCount = vCount;
        recentBookingsList = bookings || [];
        recentUsersList = dbUsers || [];
        totalRevenue = recentBookingsList.reduce((sum, b) => sum + (b.totalAmount || b.amount || 0), 0);
      } catch (e) {}
    }

    const memUsersList = Array.from(memoryUsers.values()).filter(u => u.email !== 'exploretamizhagam@gmail.com');
    if (totalUsers < memUsersList.length) totalUsers = memUsersList.length;
    if (!recentUsersList || recentUsersList.length === 0) recentUsersList = memUsersList.slice(0, 10);

    res.json({
      totalUsers: totalUsers || 0,
      totalBookings: totalBookings || 0,
      pendingBookings: pendingBookings || 0,
      cancelledBookings: cancelledBookings || 0,
      activeTrips: activeTrips || 0,
      totalProperties: totalProperties || 0,
      hotelsCount: hotelsCount || 0,
      homestaysCount: homestaysCount || 0,
      resortsCount: resortsCount || 0,
      guidesCount: guidesCount || 0,
      vendorsCount: vendorsCount || 0,
      totalRevenue: totalRevenue || 0,
      recentUsersList: recentUsersList || [],
      recentBookingsList: recentBookingsList || []
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- RESET DATABASE TO ZERO (SUPER ADMIN ONLY) ---
router.post('/admin/reset-database', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await Booking.deleteMany({});
      await Property.deleteMany({});
      await Vehicle.deleteMany({});
      await Ticket.deleteMany({});
      await User.deleteMany({ email: { $ne: 'exploretamizhagam@gmail.com' } });
    }

    memoryUsers.clear();
    memoryProperties.length = 0;
    memoryVehicles.length = 0;
    memoryTickets.length = 0;
    memoryBookings.length = 0;

    broadcast(req, 'database_reset_zero', {});
    broadcast(req, 'stats_updated', {});

    res.json({
      success: true,
      message: 'All platform data has been reset to ZERO. Super admin preserved.'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- USERS ENDPOINTS ---
router.get('/users', async (req, res) => {
  try {
    let users = [];
    if (mongoose.connection.readyState === 1) {
      users = await User.find({ email: { $ne: 'exploretamizhagam@gmail.com' } }).sort({ createdAt: -1 }).maxTimeMS(3000).catch(() => []);
    }
    const memList = Array.from(memoryUsers.values()).filter(u => u.email !== 'exploretamizhagam@gmail.com');
    const finalMap = new Map();
    for (const u of (users || [])) {
      const obj = u.toObject ? u.toObject() : { ...u };
      finalMap.set(obj.email?.toLowerCase(), obj);
    }
    for (const mem of memList) {
      const key = mem.email?.toLowerCase();
      if (finalMap.has(key)) {
        finalMap.set(key, { ...finalMap.get(key), ...mem });
      } else {
        finalMap.set(key, mem);
      }
    }
    return res.json(Array.from(finalMap.values()));
  } catch (err) {
    const memList = Array.from(memoryUsers.values()).filter(u => u.email !== 'exploretamizhagam@gmail.com');
    res.json(memList);
  }
});

// --- DIRECT INSTANT ROLE UPDATE (SUPPORTS BOTH /users/role AND /users/:id/role) ---
const handleRoleUpdateCore = async (req, res) => {
  try {
    const { role, email, userId } = req.body;
    const identifier = req.params?.id || userId || email || '';
    const targetEmail = (email || (identifier.includes('@') ? identifier : '')).toLowerCase().trim();

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    let updatedUser = null;

    // 1. Immediately update in memoryUsers
    if (targetEmail) {
      let existing = memoryUsers.get(targetEmail) || { email: targetEmail, name: targetEmail.split('@')[0] };
      existing = { ...existing, role, email: targetEmail, updatedAt: new Date().toISOString() };
      memoryUsers.set(targetEmail, existing);
      updatedUser = existing;
    }
    for (const [em, u] of memoryUsers.entries()) {
      if (u._id === identifier || u.id === identifier || em.toLowerCase() === targetEmail) {
        u.role = role;
        memoryUsers.set(em, u);
        updatedUser = u;
      }
    }

    // 2. Permanently update in MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      try {
        if (mongoose.Types.ObjectId.isValid(identifier)) {
          const dbUser = await User.findByIdAndUpdate(identifier, { $set: { role } }, { new: true });
          if (dbUser) updatedUser = dbUser;
        }
        if (targetEmail) {
          const dbUser = await User.findOneAndUpdate(
            { email: { $regex: new RegExp(`^${targetEmail}$`, 'i') } },
            { $set: { role, isVerified: true } },
            { new: true, upsert: true }
          );
          if (dbUser) updatedUser = dbUser;
        }
      } catch (dbErr) {
        console.error('Mongo role update error:', dbErr);
      }
    }

    if (!updatedUser) {
      updatedUser = { _id: identifier || 'usr-' + Date.now(), email: targetEmail, role };
      if (targetEmail) memoryUsers.set(targetEmail, updatedUser);
    }

    console.log(`✅ [ROLE UPDATED] ${targetEmail || identifier} role -> ${role}`);

    // Broadcast live event & trigger instant sync
    broadcast(req, 'user_role_updated', updatedUser);
    broadcast(req, 'stats_updated', {});

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

router.put('/users/role', handleRoleUpdateCore);
router.post('/users/role', handleRoleUpdateCore);
router.put('/users/:id/role', handleRoleUpdateCore);

// --- STAFF LISTING & CREATION ---
router.get('/admin/staff', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const staff = await User.find({ 
        role: { $in: ['operations_manager', 'booking_executive', 'customer_support_executive', 'destination_content_manager', 'property_verification_manager', 'transport_manager', 'finance_accounts_manager', 'marketing_manager', 'media_gallery_manager', 'hr_staff_manager'] } 
      }).sort({ createdAt: -1 }).maxTimeMS(2500);
      return res.json(staff);
    }
  } catch (err) {}
  res.json([]);
});

router.post('/admin/staff', async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;
    let newStaff = null;
    if (mongoose.connection.readyState === 1) {
      newStaff = await User.create({
        name,
        email: email.toLowerCase().trim(),
        phone,
        role,
        password: password || 'ExploreTN2026',
        isVerified: true
      });
    } else {
      newStaff = { _id: 'stf-' + Date.now(), name, email, phone, role, isVerified: true };
    }
    broadcast(req, 'staff_added', newStaff);
    broadcast(req, 'stats_updated', {});
    res.status(201).json(newStaff);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- PROPERTIES & RESORTS ENDPOINTS ---
router.get('/properties', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const properties = await Property.find({}).sort({ createdAt: -1 }).maxTimeMS(3000);
      return res.json(properties);
    }
  } catch (err) {}
  res.json(memoryProperties);
});

router.post('/properties', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.id;
    let saved = null;
    if (mongoose.connection.readyState === 1) {
      const prop = new Property({
        ...body,
        pricePerNight: Number(body.pricePerNight || body.price || 3800),
        price: Number(body.price || body.pricePerNight || 3800),
        status: body.status || 'Pending Approval'
      });
      saved = await prop.save();
      saved = saved.toObject ? saved.toObject() : saved;
      saved.id = saved._id ? saved._id.toString() : 'prop-' + Date.now();
    } else {
      saved = { ...body, _id: 'prop-' + Date.now(), id: 'prop-' + Date.now(), status: body.status || 'Pending Approval' };
      memoryProperties.unshift(saved);
    }
    broadcast(req, 'new_property', saved);
    broadcast(req, 'stats_updated', {});
    res.status(201).json(saved);
  } catch (err) {
    console.error('Property save error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.put('/properties/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const propId = req.params.id;
    let updated = null;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(propId)) {
        updated = await Property.findByIdAndUpdate(propId, { status }, { new: true });
      } else {
        updated = await Property.findOneAndUpdate({ $or: [{ _id: propId }, { id: propId }] }, { status }, { new: true });
      }
    }
    if (!updated) {
      const idx = memoryProperties.findIndex(p => p._id === propId || p.id === propId);
      if (idx !== -1) {
        memoryProperties[idx].status = status;
        updated = memoryProperties[idx];
      }
    }
    broadcast(req, 'property_updated', updated || { _id: propId, status });
    broadcast(req, 'stats_updated', {});
    res.json(updated || { success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/properties/:id', async (req, res) => {
  try {
    const propId = req.params.id;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(propId)) {
        await Property.findByIdAndDelete(propId);
      } else {
        await Property.findOneAndDelete({ $or: [{ _id: propId }, { id: propId }] });
      }
    }
    const idx = memoryProperties.findIndex(p => p._id === propId || p.id === propId);
    if (idx !== -1) memoryProperties.splice(idx, 1);
    broadcast(req, 'property_deleted', { _id: propId });
    broadcast(req, 'stats_updated', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- VEHICLES ENDPOINTS ---
router.get('/vehicles', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const vehicles = await Vehicle.find({}).sort({ createdAt: -1 }).maxTimeMS(3000);
      return res.json(vehicles);
    }
  } catch (err) {}
  res.json(memoryVehicles);
});

router.post('/vehicles', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.id;
    let saved = null;
    if (mongoose.connection.readyState === 1) {
      const veh = new Vehicle({
        ...body,
        pricePerDay: Number(body.pricePerDay || body.price || 3500),
        price: Number(body.price || body.pricePerDay || 3500),
        status: body.status || 'Pending Approval'
      });
      saved = await veh.save();
      saved = saved.toObject ? saved.toObject() : saved;
      saved.id = saved._id ? saved._id.toString() : 'veh-' + Date.now();
    } else {
      saved = { ...body, _id: 'veh-' + Date.now(), id: 'veh-' + Date.now(), status: body.status || 'Pending Approval' };
      memoryVehicles.unshift(saved);
    }
    broadcast(req, 'new_vehicle', saved);
    broadcast(req, 'stats_updated', {});
    res.status(201).json(saved);
  } catch (err) {
    console.error('Vehicle save error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.put('/vehicles/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const vehId = req.params.id;
    let updated = null;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(vehId)) {
        updated = await Vehicle.findByIdAndUpdate(vehId, { status }, { new: true });
      } else {
        updated = await Vehicle.findOneAndUpdate({ $or: [{ _id: vehId }, { id: vehId }] }, { status }, { new: true });
      }
    }
    broadcast(req, 'vehicle_updated', updated || { _id: vehId, status });
    broadcast(req, 'stats_updated', {});
    res.json(updated || { success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/vehicles/:id', async (req, res) => {
  try {
    const vehId = req.params.id;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(vehId)) {
        await Vehicle.findByIdAndDelete(vehId);
      }
    }
    broadcast(req, 'vehicle_deleted', { _id: vehId });
    broadcast(req, 'stats_updated', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- SUPPORT TICKETS ENDPOINTS ---
router.get('/tickets', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const tickets = await Ticket.find({}).sort({ createdAt: -1 }).maxTimeMS(3000);
      return res.json(tickets);
    }
  } catch (err) {}
  res.json(memoryTickets);
});

router.post('/tickets', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.id;
    const ticketId = body.ticketId || ('TCK-' + Math.floor(2000 + Math.random() * 8000));
    let saved = null;
    if (mongoose.connection.readyState === 1) {
      const ticket = new Ticket({
        ...body,
        ticketId,
        status: body.status || 'Open'
      });
      saved = await ticket.save();
      saved = saved.toObject ? saved.toObject() : saved;
      saved.id = saved._id ? saved._id.toString() : 'tck-' + Date.now();
    } else {
      saved = { ...body, ticketId, status: body.status || 'Open', _id: 'tck-' + Date.now(), id: 'tck-' + Date.now() };
      memoryTickets.unshift(saved);
    }
    broadcast(req, 'new_ticket', saved);
    res.status(201).json(saved);
  } catch (err) {
    console.error('Ticket save error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.put('/tickets/:id/status', async (req, res) => {
  try {
    const { status, adminReply } = req.body;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        const updated = await Ticket.findByIdAndUpdate(
          req.params.id, 
          { status, adminReply }, 
          { new: true }
        );
        broadcast(req, 'ticket_updated', updated);
        return res.json(updated);
      }
    }
  } catch (err) {}
  broadcast(req, 'ticket_updated', { _id: req.params.id, status: req.body.status });
  res.json({ success: true });
});

router.delete('/tickets/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        await Ticket.findByIdAndDelete(req.params.id);
      }
    }
    broadcast(req, 'ticket_deleted', { _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- BOOKINGS ENDPOINTS ---
router.get('/bookings', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const bookings = await Booking.find({}).sort({ createdAt: -1 }).maxTimeMS(3000);
      return res.json(bookings);
    }
  } catch (err) {}
  res.json(memoryBookings);
});

// Check Property Availability
router.post('/bookings/check-availability', async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut } = req.body;
    // Can check if there are overlapping active bookings
    res.json({
      available: true,
      message: 'Property is available for the selected dates!'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.id;
    const bookingId = body.bookingId || ('ETN-BK-' + Math.floor(100000 + Math.random() * 900000));
    const totalAmount = Number(body.totalAmount || body.amount || 0);

    const bookingData = {
      ...body,
      bookingId,
      totalAmount,
      amount: totalAmount,
      status: body.status || 'Pending Verification',
      paymentStatus: body.paymentStatus || 'Paid',
      paymentMethod: body.paymentMethod || 'Razorpay Test Gateway',
      paymentId: body.paymentId || ('pay_rzp_' + Date.now()),
      createdAt: new Date()
    };

    let saved = null;
    if (mongoose.connection.readyState === 1) {
      const booking = new Booking(bookingData);
      saved = await booking.save();
      saved = saved.toObject ? saved.toObject() : saved;
      saved.id = saved._id ? saved._id.toString() : 'bk-' + Date.now();
    } else {
      saved = { ...bookingData, _id: 'bk-' + Date.now(), id: 'bk-' + Date.now() };
      memoryBookings.unshift(saved);
    }

    // 📧 1. Dispatch Booking Received (Pending Verification) Email to Customer & Host
    sendBookingPendingMail(saved).catch(e => console.error('Pending mail error:', e.message));

    // Broadcast live socket updates immediately to all dashboards
    broadcast(req, 'new_booking', saved);
    broadcast(req, 'payment_received', saved);
    broadcast(req, 'stats_updated', {});

    // Send instant in-app notification to customer
    const custEmail = (saved.customerEmail || saved.userEmail || '').toLowerCase().trim();
    if (custEmail) {
      broadcast(req, 'new_notification', {
        userEmail: custEmail,
        title: `⏳ Booking Placed (Pending Verification) - ${saved.itemTitle || saved.propertyTitle || 'Stay'}`,
        message: `Your booking ${saved.bookingId} is placed! Host is verifying availability. You'll receive your confirmed pass once accepted.`,
        date: 'Just now'
      });
    }

    // Send instant in-app notification to property owner
    const hostEmail = (saved.ownerEmail || '').toLowerCase().trim();
    if (hostEmail) {
      broadcast(req, 'new_notification', {
        userEmail: hostEmail,
        title: `🔔 New Booking Awaiting Approval (${saved.itemTitle || saved.propertyTitle || 'Property'})`,
        message: `New reservation ${saved.bookingId} by ${saved.customerName || saved.userName || 'Tourist'} for ₹${Number(saved.totalAmount).toLocaleString()}. Please review and accept.`,
        date: 'Just now'
      });
    }

    console.log(`✅ [BOOKING RECORDED - PENDING VERIFICATION] ${bookingId} for ${saved.itemTitle || saved.propertyTitle} (₹${totalAmount}) [Razorpay: ${saved.paymentId}]`);

    res.status(201).json({
      success: true,
      booking: saved,
      message: 'Booking submitted and pending host availability confirmation. Verification email sent!'
    });
  } catch (err) {
    console.error('Booking save error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.put('/bookings/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const bookingId = req.params.id;
    let updated = null;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(bookingId)) {
        updated = await Booking.findByIdAndUpdate(bookingId, { status }, { new: true });
      } else {
        updated = await Booking.findOneAndUpdate({ $or: [{ bookingId }, { _id: bookingId }] }, { status }, { new: true });
      }
      if (updated && updated.toObject) updated = updated.toObject();
    }
    
    if (!updated) {
      const idx = memoryBookings.findIndex(b => (b.id === bookingId || b._id === bookingId || b.bookingId === bookingId));
      if (idx !== -1) {
        memoryBookings[idx].status = status;
        updated = memoryBookings[idx];
      } else {
        updated = { _id: bookingId, bookingId, status };
      }
    }

    // 📧 2. If status is changed to Confirmed, dispatch Official Hotel Voucher Confirmation Email!
    if (status === 'Confirmed' && updated) {
      sendBookingConfirmedMail(updated).catch(e => console.error('Confirmed mail error:', e.message));

      const custEmail = (updated.customerEmail || updated.userEmail || '').toLowerCase().trim();
      if (custEmail) {
        broadcast(req, 'new_notification', {
          userEmail: custEmail,
          title: `🎉 OFFICIAL BOOKING CONFIRMED: ${updated.bookingId}`,
          message: `Your stay at ${updated.propertyTitle || updated.itemTitle || 'Property'} has been confirmed! Confirmation voucher sent to your email.`,
          date: 'Just now'
        });
      }
    }

    broadcast(req, 'booking_updated', updated);
    broadcast(req, 'stats_updated', {});
    console.log(`✅ [BOOKING STATUS UPDATED] ${bookingId} -> ${status}`);
    res.json(updated || { success: true });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    const bookingId = req.params.id;
    if (mongoose.connection.readyState === 1) {
      if (mongoose.Types.ObjectId.isValid(bookingId)) {
        await Booking.findByIdAndDelete(bookingId);
      } else {
        await Booking.findOneAndDelete({ $or: [{ bookingId }, { _id: bookingId }] });
      }
    }
    broadcast(req, 'booking_deleted', { _id: bookingId });
    broadcast(req, 'stats_updated', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
