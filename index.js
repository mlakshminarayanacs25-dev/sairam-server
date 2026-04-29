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

// --- CORS ---
app.use(cors({
    origin: ["https://sairamtutorials.vercel.app", "https://sairam-client-vsum.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
}));

app.use(express.json());

// --- DIRECTORY ---
const uploadsDir = path.join(__dirname, 'uploads'); 
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --- SCHEMA ---
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

// --- UPDATED EMAIL TRANSPORTER (PORT 587) ---
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    },
    tls: {
        rejectUnauthorized: false // Bypasses the "Email failed" error
    }
});

// --- ROUTES ---

// 1. REGISTER & SEND OTP
app.post('/api/register', async (req, res) => {
    const { name, mobile, email, password } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[mobile] = { otp, name, email, password }; 
    
    try {
        await transporter.sendMail({
            from: `"SAI RAM TUTORIALS" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Verification Code",
            html: `<h3>Welcome to Sai Ram Tutorials</h3><p>Your OTP: <b>${otp}</b></p>`
        });
        console.log(`OTP ${otp} sent to ${email}`);
        res.status(200).json({ success: true });
    } catch (err) { 
        console.error("NODEMAILER ERROR:", err);
        res.status(500).json({ error: "Email failed" }); 
    }
});

// 2. VERIFY OTP
app.post('/api/verify-registration', async (req, res) => {
    const { mobile, otp } = req.body;
    const pending = otpStore[mobile];
    if (pending && pending.otp.toString() === otp.toString()) {
        try {
            const newStudent = new Student({ ...pending, mobile, isApproved: false });
            await newStudent.save();
            delete otpStore[mobile]; 
            res.status(200).json({ success: true });
        } catch (dbErr) { res.status(500).json({ error: "Mobile already registered" }); }
    } else { res.status(400).json({ error: "Invalid OTP" }); }
});

// 3. LOGIN (LOCKED UNTIL APPROVED)
app.post('/api/login', async (req, res) => {
    const { mobile, password } = req.body;
    try {
        const student = await Student.findOne({ mobile, password });
        if (!student) return res.status(401).json({ error: "Invalid Credentials" });
        if (!student.isApproved) return res.status(403).json({ error: "Account Pending Admin Approval" });
        res.json({ success: true, student });
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

// 4. ADMIN: GET ALL
app.get('/api/admin/pending', async (req, res) => {
    try {
        const students = await Student.find({}).sort({ createdAt: -1 }); 
        res.json(students);
    } catch (err) { res.status(500).json({ error: "Fetch Error" }); }
});

// 5. ADMIN: APPROVE & NOTIFY
app.post('/api/admin/approve', async (req, res) => {
    const { mobile } = req.body;
    try {
        const student = await Student.findOneAndUpdate({ mobile }, { isApproved: true }, { new: true });
        
        await transporter.sendMail({
            from: `"SAI RAM TUTORIALS" <${process.env.EMAIL_USER}>`,
            to: student.email,
            subject: "Login Access Granted!",
            html: `<h3>Hello ${student.name},</h3><p>Your account is approved. You can now login!</p>`
        });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Approval failed" }); }
});

// 6. ADMIN: DELETE
app.delete('/api/admin/delete-student/:mobile', async (req, res) => {
    try {
        await Student.findOneAndDelete({ mobile: req.params.mobile });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// --- FILE MANAGEMENT ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folder = path.join(uploadsDir, req.body.subject || 'General');
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        cb(null, `${req.body.category}-${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

app.post('/api/admin/upload', upload.single('file'), (req, res) => res.json({ success: true }));

app.get('/api/files/:subject', (req, res) => {
    const p = path.join(uploadsDir, req.params.subject);
    if (!fs.existsSync(p)) return res.json([]);
    res.json(fs.readdirSync(p).map(f => ({ name: f, category: f.split('-')[0] })));
});

app.post('/api/admin/delete-file', (req, res) => {
    const p = path.join(uploadsDir, req.body.subject, req.body.fileName);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ success: true });
});

// --- DATABASE & START ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.error("Database Connection Error:", err));