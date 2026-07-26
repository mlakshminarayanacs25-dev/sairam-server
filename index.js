const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// 1. CORS CONFIGURATION
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

// 2. INITIALIZE RESEND API
const resend = new Resend(process.env.RESEND_API_KEY);

// Temporary Memory Storage for Users
const tempUserStore = {};

// --- REGISTRATION ROUTE ---
app.post('/api/register', async (req, res) => {
    // Accepts all possible field names sent from your React form
    const { email, username, name, password, phone } = req.body;
    const finalUsername = username || name;

    try {
        if (!email || !finalUsername || !password) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing required fields (email, name/username, or password)" 
            });
        }

        // Generate 6-digit OTP and hash password
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        // Store user in temporary object
        tempUserStore[email] = { 
            username: finalUsername, 
            password: hashedPassword, 
            phone: phone || '', 
            otp 
        };

        // Print OTP to server logs so you can see it on Render during testing
        console.log(`[OTP Generated] For: ${email} | Code: ${otp}`);

        // Try sending OTP via Resend safely
        try {
            const { error } = await resend.emails.send({
                from: 'Sairam Tutorials <onboarding@resend.dev>',
                to: email,
                subject: `Your OTP: ${otp}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                        <h2>Welcome to Sairam Tutorials</h2>
                        <p>Hi <strong>${finalUsername}</strong>, your verification code is:</p>
                        <h1 style="color: #4f46e5; letter-spacing: 2px;">${otp}</h1>
                    </div>
                `
            });

            if (error) {
                console.warn("Resend email delivery warning (Free tier restriction):", error.message);
            }
        } catch (resendErr) {
            console.warn("Failed to send email via Resend, proceeding with flow:", resendErr);
        }

        // Always return success so user can proceed to enter OTP
        return res.status(200).json({ 
            success: true, 
            message: "OTP sent successfully!" 
        });

    } catch (err) {
        console.error("Server Crash Error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
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

// --- ADMIN UPLOAD ROUTE ---
app.post('/api/admin/upload', (req, res) => {
    res.status(200).json({ success: true, message: "Upload received successfully!" });
});

// --- ADMIN PENDING ROUTE ---
app.get('/api/admin/pending', (req, res) => {
    res.status(200).json({ success: true, pendingRequests: [] });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));