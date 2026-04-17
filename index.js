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
app.use(cors()); 
app.use(express.json());

// --- 1. SMART DIRECTORY SETUP ---
// This identifies if 'uploads' is inside 'server' or in the root folder
let uploadsDir = path.join(__dirname, 'uploads'); 

if (!fs.existsSync(uploadsDir)) {
    const parentDirUploads = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(parentDirUploads)) {
        uploadsDir = parentDirUploads;
    } else {
        // Creates it inside 'server' if not found anywhere
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
}
console.log("✅ Server successfully linked to:", uploadsDir);

app.use('/uploads', express.static(uploadsDir));

// --- 2. DATABASE SCHEMA ---
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

// --- 3. EMAIL SETUP ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});

// --- 4. AUTHENTICATION ROUTES ---
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
    } catch (err) {
        console.error("❌ Email Error:", err);
        res.status(500).json({ error: "Email failed to send." });
    }
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
        } catch (dbErr) {
            res.status(500).json({ error: "User already exists." });
        }
    } else {
        res.status(400).json({ error: "Invalid OTP" });
    }
});

app.post('/api/login', async (req, res) => {
    const { mobile, password } = req.body;
    try {
        const student = await Student.findOne({ mobile, password });
        if (!student) return res.status(401).json({ error: "Invalid credentials" });
        if (!student.isApproved) return res.status(403).json({ error: "Account pending approval" });
        res.json({ success: true, student });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// --- 5. ADMIN STUDENT MANAGEMENT ---
app.get('/api/admin/pending', async (req, res) => {
    try {
        const students = await Student.find({}).sort({ createdAt: -1 }); 
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: "Fetch failed" });
    }
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

// --- 6. FILE UPLOAD SYSTEM (RELIABLE PATHS) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Multer reads fields in order; ensure 'subject' is sent BEFORE 'file' in frontend
    const subject = req.body.subject || 'Uncategorized'; 
    const subjectFolder = path.join(uploadsDir, subject); 
    
    try {
        if (!fs.existsSync(subjectFolder)) {
            fs.mkdirSync(subjectFolder, { recursive: true });
        }
        cb(null, subjectFolder);
    } catch (err) {
        console.error("❌ Folder Creation Error:", err);
        cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    const category = req.body.category || 'General';
    // Sanitizes filename by replacing spaces with underscores
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${category}-${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

app.post('/api/admin/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
      console.error("❌ Upload Attempt Failed: No file received");
      return res.status(400).json({ error: "No file uploaded" });
  }
  console.log("📂 File saved at:", req.file.path);
  res.json({ success: true, message: "File uploaded successfully" });
});

// --- 7. FILE MANAGEMENT ---
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
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: "File deleted successfully" });
        } else {
            res.status(404).json({ error: "File not found" });
        }
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// --- 8. DATABASE CONNECTION ---
const DB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/sairam";
mongoose.connect(DB_URI)
    .then(() => {
        console.log("📂 Database Connected Successfully");
        app.listen(5000, () => {
            console.log(`🚀 Server running on Port 5000`);
            console.log(`📡 Ready for uploads...`);
        });
    })
    .catch(err => {
        console.error("❌ MongoDB Connection Error:", err.message);
    });