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

app.use(cors({
    origin: ["https://sairamtutorials.vercel.app", "https://sairam-client-vsum.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
}));

app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads'); 
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

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

// --- THE FINAL TRANSPORTER CONFIG ---
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
    
    const mailOptions = {
        from: `"SAI RAM TUTORIALS" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verification Code",
        text: `Your OTP is: ${otp}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP sent to ${email}`);
        res.status(200).json({ success: true });
    } catch (err) { 
        // THIS LOG IS CRITICAL - READ IT IN YOUR TERMINAL
        console.error("CRITICAL EMAIL ERROR:", err.message);
        res.status(500).json({ error: "Email failed", details: err.message }); 
    }
});

app.post('/api/verify-registration', async (req, res) => {
    const { mobile, otp } = req.body;
    const pending = otpStore[mobile];
    if (pending && pending.otp.toString() === otp.toString()) {
        try {
            const newStudent = new Student({ ...pending, mobile, isApproved: false });
            await newStudent.save();
            delete otpStore[mobile]; 
            res.status(200).json({ success: true });
        } catch (dbErr) { res.status(500).json({ error: "User exists" }); }
    } else { res.status(400).json({ error: "Invalid OTP" }); }
});

app.post('/api/login', async (req, res) => {
    const { mobile, password } = req.body;
    try {
        const student = await Student.findOne({ mobile, password });
        if (!student) return res.status(401).json({ error: "Wrong info" });
        if (!student.isApproved) return res.status(403).json({ error: "Not Approved" });
        res.json({ success: true, student });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.get('/api/admin/pending', async (req, res) => {
    const students = await Student.find({}).sort({ createdAt: -1 }); 
    res.json(students);
});

app.post('/api/admin/approve', async (req, res) => {
    const { mobile } = req.body;
    try {
        const student = await Student.findOneAndUpdate({ mobile }, { isApproved: true }, { new: true });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: student.email,
            subject: "Approved!",
            text: `Hi ${student.name}, you are approved. Login now!`
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Approval email failed" }); }
});

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

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Database Connected");
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    });