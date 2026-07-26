const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// 1. FIX CORS ERROR (Allows localhost during development and Vercel in production)
const allowedOrigins = [
    'http://localhost:3000',
    'https://sairamtutorials.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like Postman or server-to-server)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Blocked by CORS policy'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));

app.use(express.json());

// 2. INITIALIZE RESEND
const resend = new Resend(process.env.RESEND_API_KEY);

// Temporary Storage
const tempUserStore = {};

// --- REGISTRATION ROUTE ---
app.post('/api/register', async (req, res) => {
    const { email, username, password } = req.body;

    try {
        if (!email || !username || !password) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        tempUserStore[email] = { username, password: hashedPassword, otp };

        const { data, error } = await resend.emails.send({
            from: 'Sairam Tutorials <onboarding@resend.dev>',
            to: email,
            subject: `Your OTP: ${otp}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                    <h2>Welcome to Sairam Tutorials</h2>
                    <p>Hi ${username}, your verification code is:</p>
                    <h1 style="color: #4f46e5;">${otp}</h1>
                </div>
            `
        });

        if (error) {
            console.error("Resend Error:", error);
            return res.status(500).json({ success: false, message: "Email service failed" });
        }

        res.status(200).json({ success: true, message: "OTP sent to email!" });

    } catch (err) {
        console.error("Server Crash:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// --- VERIFY ROUTE ---
app.post('/api/verify', (req, res) => {
    const { email, otp } = req.body;
    const user = tempUserStore[email];

    if (user && user.otp === otp) {
        res.status(200).json({ success: true, message: "Account Verified!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
    }
});

// --- ADMIN UPLOAD ROUTE (Added to fix 404 error) ---
app.post('/api/admin/upload', (req, res) => {
    // Replace this logic later with file/data handling logic
    res.status(200).json({ success: true, message: "Upload received successfully!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));