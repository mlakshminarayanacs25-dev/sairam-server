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

// --- 1. DYNAMIC CORS SETUP ---
app.use(cors({
    origin: ["https://sairam-client.vercel.app", "http://localhost:3000"], 
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());

// --- 2. DIRECTORY SETUP ---
let uploadsDir = path.join(__dirname, 'uploads'); 
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// --- 3. DATABASE SCHEMA ---
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

// --- 4. EMAIL SETUP ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});

// --- 5. ROUTES ---
app.post('/api/register', async (req, res) => {
    const { name, mobile, email, password } = req.body;
    if (!email || !name || !password || !mobile) return res.status(400).json({ error: "All fields required" });
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[mobile] = { otp, name, email, password }; 
    try {
        await transporter.sendMail({
            from: `"SAI RAM TUTORIALS" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Verification Code - Sai Ram Tutorials",
            text: `Namaste ${name}, your verification code is: ${otp}.`
        });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: "Email failed." }); }
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
        } catch (dbErr) { res.status(500).json({ error: "User already exists." }); }
    } else { res.status(400).json({ error: "Invalid OTP" }); }
});

app.post('/api/login', async (req, res) => {
    const { mobile, password } = req.body;
    try {
        const student = await Student.findOne({ mobile, password });
        if (!student) return res.status(401).json({ error: "Invalid credentials" });
        if (!student.isApproved) return res.status(403).json({ error: "Account pending approval" });
        res.json({ success: true, student });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

app.get('/api/admin/pending', async (req, res) => {
    try {
        const students = await Student.find({}).sort({ createdAt: -1 }); 
        res.json(students);
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.post('/api/admin/approve', async (req, res) => {
    const { mobile } = req.body;
    try {
        const student = await Student.findOneAndUpdate({ mobile }, { isApproved: true }, { new: true });
        await transporter.sendMail({
            from: `"SAI RAM TUTORIALS"`,
            to: student.email,
            subject: "Access Granted",
            html: `<h2>Namaste ${student.name}, Your account is active!</h2>`
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Approval failed" }); }
});

// --- 6. UPLOAD ENGINE ---
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

// --- 7. SERVER START ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        app.listen(PORT, () => console.log(`🚀 Server on Port ${PORT}`));
    })
    .catch(err => console.error("Database Error", err));