import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Cab SUV', 'Tempo Traveller', 'Rental Bike', 'Luxury Bus', 'Sedan', 'Innova', 'Traveller'],
    default: 'Cab SUV'
  },
  registrationNumber: { type: String },
  regNo: { type: String },
  providerName: { type: String, default: 'Veera Cabs & Transport' },
  providerPhone: { type: String, default: '+91 78717 79134' },
  providerEmail: { type: String },
  district: { type: String, default: 'Nilgiris (Ooty)' },
  seatingCapacity: { type: Number, default: 7 },
  pricePerDay: { type: Number },
  price: { type: Number, default: 3500 },
  driverAssigned: { type: String, default: 'Ramesh V.' },
  image: { type: String, default: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2' },
  status: { type: String, enum: ['Approved', 'Active', 'Pending Approval', 'Rejected'], default: 'Pending Approval' },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

export const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
