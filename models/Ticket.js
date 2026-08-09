import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true
    },
    senderName: {
      type: String,
      required: true
    },
    senderEmail: {
      type: String,
      required: true
    },
    senderRole: {
      type: String,
      enum: ['user', 'guest', 'owner', 'vendor', 'owner_and_vendor', 'guide', 'staff'],
      default: 'user'
    },
    subject: {
      type: String,
      required: true
    },
    category: {
      type: String,
      default: 'General Inquiry'
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open'
    },
    adminReply: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

export const Ticket = mongoose.model('Ticket', ticketSchema);
