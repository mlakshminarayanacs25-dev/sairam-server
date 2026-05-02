const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// 1. FIX CORS ERROR
// This allows your Vercel frontend to talk to your Render backend
app.use(cors({
    origin: 'https://sairamtutorials.vercel.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// 2. INITIALIZE RESEND (Fixes the 500 Mail Timeout)
const resend = new Resend(process.env.RESEND_API_KEY);

// Temporary Storage (Use MongoDB in the future)
const tempUserStore = {};

// --- REGISTRATION ROUTE ---
app.post('/api/register', async (req, res) => {
    const { email, username, password } = req.body;

    try {
        if (!email || !username || !password) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        // Store user data temporarily
        tempUserStore[email] = { username, password: hashedPassword, otp };

        // SEND OTP VIA RESEND API (Uses Port 443, allowed by Render)
        const { data, error } = await resend.emails.send({
            from: 'Sairam Tutorials <onboarding@resend.dev>',
            to: email, // Note: Free tier only sends to your own email unless domain is verified
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
        // Logic to move user to permanent Database goes here
        res.status(200).json({ success: true, message: "Account Verified!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));