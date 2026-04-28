const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); 

require('dotenv').config(); 
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer'); 
const path = require('path');    
const fs = require('fs');        

const app = express();

// --- CORS SETUP ---
const allowedOrigins = [
    "https://sairamtutorials.vercel.app",
    "https://sairam-client-vsum.vercel.app",
    "http://localhost:3000"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS blocked'), false);
        }
        return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
}));

app.use(express.json());

// --- DIRECTORY SETUP ---
const uploadsDir = path.join(__dirname, 'uploads'); 
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// --- DATABASE SCHEMA ---
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    password: { type: String, required: true }, 
    isApproved: { type: Boolean, default: false }, 
    createdAt: { type: Date, default: Date.now }
});

const Student = mongoose.model('Student', studentSchema);
const otpStore = {}; 

// --- EMAIL SETUP ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});

// --- ROUTES ---

app.post('/api/register', async (req, res) => {
    const { name, mobile, email, password } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[mobile] = { otp, name, email, password }; 
    try {
        await transporter.sendMail({
            from: `"SAI RAM TUTORIALS" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Verification Code",
            text: `Your code is: ${otp}`
        });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: "Email failed" }); }
});

app.post('/api/verify-registration', async (req, res) => {
    const { mobile, otp } = req.body;
    const pending = otpStore[mobile];
    if (pending && pending.otp.toString() === otp.toString()) {
        try {
            const newStudent = new Student({ ...pending, mobile });
            await newStudent.save();
            delete otpStore[mobile]; 
            res.status(200).json({ success: true });
        } catch (dbErr) { res.status(500).json({ error: "Exists" }); }
    } else { res.status(400).json({ error: "Invalid OTP" }); }
});

app.post('/api/login', async (req, res) => {
    const { mobile, password } = req.body;
    try {
        const student = await Student.findOne({ mobile, password });
        if (!student) return res.status(401).json({ error: "Invalid" });
        if (!student.isApproved) return res.status(403).json({ error: "Pending" });
        res.json({ success: true, student });
    } catch (err) { res.status(500).json({ error: "Fail" }); }
});

app.get('/api/admin/pending', async (req, res) => {
    try {
        const students = await Student.find({}).sort({ createdAt: -1 }); 
        res.json(students);
    } catch (err) { res.status(500).json({ error: "Fetch fail" }); }
});

app.post('/api/admin/approve', async (req, res) => {
    const { mobile } = req.body;
    try {
        await Student.findOneAndUpdate({ mobile }, { isApproved: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Fail" }); }
});

// REMOVE STUDENT ROUTE
app.delete('/api/admin/delete-student/:mobile', async (req, res) => {
    try {
        await Student.findOneAndDelete({ mobile: req.params.mobile });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Delete fail" }); }
});

// --- FILE ENGINE ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subject = req.body.subject || 'Uncategorized'; 
    const subjectFolder = path.join(uploadsDir, subject); 
    if (!fs.existsSync(subjectFolder)) fs.mkdirSync(subjectFolder, { recursive: true });
    cb(null, subjectFolder);
  },
  filename: (req, file, cb) => {
    const category = req.body.category || 'General';
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${category}-${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage });

app.post('/api/admin/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({ success: true });
});

app.get('/api/files/:subject', (req, res) => {
  const subjectPath = path.join(uploadsDir, req.params.subject);
  if (!fs.existsSync(subjectPath)) return res.json([]);
  const files = fs.readdirSync(subjectPath).map(filename => ({
      name: filename,
      category: filename.split('-')[0] 
  }));
  res.json(files);
});

app.post('/api/admin/delete-file', (req, res) => {
    const { subject, fileName } = req.body;
    const filePath = path.join(uploadsDir, subject, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Not found" });
    }
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        app.listen(PORT, () => console.log(`🚀 Server on Port ${PORT}`));
    })
    .catch(err => console.error("Database Error", err));