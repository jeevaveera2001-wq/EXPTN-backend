import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true },
  propertyId: { type: String },
  propertyTitle: { type: String },
  destination: { type: String },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String },
  checkIn: { type: String, required: true },
  checkOut: { type: String, required: true },
  dates: { type: String },
  guests: { type: Number, default: 2 },
  totalAmount: { type: Number, required: true },
  amount: { type: Number },
  status: { type: String, enum: ['Confirmed', 'Pending Approval', 'Cancelled', 'Completed', 'Approved'], default: 'Pending Approval' },
  paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Refunded'], default: 'Paid' },
  ownerName: { type: String },
  ownerEmail: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

export const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
