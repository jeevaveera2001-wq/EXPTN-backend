import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  title: { type: String, required: true }, // e.g. Innova Crysta 7-Seater Luxury Cab
  type: { 
    type: String, 
    enum: ['Cab SUV', 'Tempo Traveller', 'Rental Bike', 'Luxury Bus', 'Sedan'],
    default: 'Cab SUV'
  },
  registrationNumber: { type: String, required: true }, // e.g. TN-37-ET-2026
  providerName: { type: String, default: 'Veera Cabs & Transport' },
  providerPhone: { type: String, default: '+91 78717 79134' },
  district: { type: String, default: 'Nilgiris (Ooty)' },
  seatingCapacity: { type: Number, default: 7 },
  pricePerDay: { type: Number, required: true }, // e.g. 3500
  driverAssigned: { type: String, default: 'Ramesh V.' },
  image: { type: String, default: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2' },
  status: { type: String, enum: ['Approved', 'Pending Approval', 'Rejected'], default: 'Approved' },
  createdAt: { type: Date, default: Date.now }
});

export const Vehicle = mongoose.model('Vehicle', vehicleSchema);
