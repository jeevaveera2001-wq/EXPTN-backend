import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  district: { type: String, required: true },
  location: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Resort', 'Home stay', 'Lakeview resort', 'River view resort', 'Mountain view resort', 'Heritage Cottage', 'Forest Eco Stay', 'Hotel'],
    default: 'Resort'
  },
  pricePerNight: { type: Number, required: true },
  rating: { type: Number, default: 4.8 },
  reviewsCount: { type: Number, default: 12 },
  images: [{ type: String }],
  description: { type: String },
  amenities: [{ type: String }],
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ownerName: { type: String, default: 'Host Owner' },
  status: { type: String, enum: ['Approved', 'Active', 'Pending Approval', 'Rejected', 'Suspended'], default: 'Approved' },
  createdAt: { type: Date, default: Date.now }
});

export const Property = mongoose.model('Property', propertySchema);
