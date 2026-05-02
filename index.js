const express = require('express');
const { Resend } = require('resend');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(express.json());

// Initialize Resend with API Key from Render Environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Temporary In-Memory Store (Use MongoDB in production)
const users = {}; 

// --- ROUTE 1: REGISTER & SEND OTP ---
app.post('/api/register', async (req, res) => {
    const { email, username, password } = req.body;

    try {
        if (!email || !username || !password) {
            return res.status(400).json({ success: false, message: "Please fill all fields" });
        }

        // 1. Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Save User Data (Temporary Store)
        users[email] = { username, password: hashedPassword, otp, isVerified: false };

        // 3. Send OTP via Resend API (Bypasses Render's port blocks)
        const { data, error } = await resend.emails.send({
            from: 'Sairam Tutorials <onboarding@resend.dev>',
            to: email, // Note: In Resend Free, this MUST be your own email for testing
            subject: `${otp} is your Sairam Tutorials OTP`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
                    <h2 style="color: #4A90E2;">Welcome to Sairam Tutorials!</h2>
                    <p>Hi ${username},</p>
                    <p>Your verification code is below. It will expire shortly.</p>
                    <h1 style="background: #f4f4f4; padding: 10px; display: inline-block; letter-spacing: 5px;">${otp}</h1>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `
        });

        if (error) {
            console.error("Resend Error:", error);
            return res.status(500).json({ success: false, message: "Failed to send email" });
        }

        res.status(200).json({ success: true, message: "OTP sent to email!" });

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// --- ROUTE 2: VERIFY OTP ---
app.post('/api/verify', async (req, res) => {
    const { email, otp } = req.body;
    const user = users[email];

    if (user && user.otp === otp) {
        user.isVerified = true;
        // In production: Save 'user' to your actual Database here
        res.status(200).json({ success: true, message: "Email verified successfully!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Sairam Server running on port ${PORT}`));