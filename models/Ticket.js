import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true
    },
    senderName: {
      type: String,
      default: 'Guest User'
    },
    senderEmail: {
      type: String,
      required: true
    },
    senderRole: {
      type: String,
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
      default: ''
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
  { timestamps: true, strict: false }
);

export const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
