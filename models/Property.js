import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  district: { type: String, default: 'Nilgiris' },
  location: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Resort', 'Home stay', 'Lakeview resort', 'River view resort', 'Mountain view resort', 'Heritage Cottage', 'Forest Eco Stay', 'Hotel', 'Homestay'],
    default: 'Homestay'
  },
  pricePerNight: { type: Number, required: true },
  price: { type: Number },
  rating: { type: Number, default: 4.9 },
  reviewsCount: { type: Number, default: 1 },
  images: [{ type: String }],
  coordinates: {
    lat: { type: Number, default: 11.4102 },
    lng: { type: Number, default: 76.6950 }
  },
  googleMapsUrl: { type: String },
  description: { type: String },
  amenities: [{ type: String }],
  ownerRules: [{ type: String }],
  reviews: [{
    userName: { type: String },
    userEmail: { type: String },
    rating: { type: Number, default: 5 },
    comment: { type: String },
    tripType: { type: String, default: 'Verified Stay' },
    date: { type: Date, default: Date.now }
  }],
  ownerId: { type: String },
  ownerName: { type: String, default: 'Host Owner' },
  ownerEmail: { type: String },
  status: { type: String, enum: ['Approved', 'Active', 'Pending Approval', 'Rejected', 'Suspended'], default: 'Pending Approval' },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

export const Property = mongoose.models.Property || mongoose.model('Property', propertySchema);
