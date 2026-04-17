const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    isVerified: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    category: { type: String, enum: ['General', 'OBC', 'EWS', 'SC', 'ST'], default: 'General' },
    certificateDate: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', StudentSchema);
