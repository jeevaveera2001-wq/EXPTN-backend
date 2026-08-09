import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  propertyTitle: { type: String },
  destination: { type: String },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String },
  checkIn: { type: String, required: true },
  checkOut: { type: String, required: true },
  guests: { type: Number, default: 2 },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['Confirmed', 'Pending Approval', 'Cancelled', 'Completed'], default: 'Pending Approval' },
  paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Refunded'], default: 'Paid' },
  ownerName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export const Booking = mongoose.model('Booking', bookingSchema);
