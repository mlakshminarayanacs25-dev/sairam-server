const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// 1. CORS CONFIGURATION (Allows localhost during development and Vercel in production)
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

// Temporary Storage
const tempUserStore = {};

// --- REGISTRATION ROUTE ---
app.post('/api/register', async (req, res) => {
    // Accepts all field names that your frontend form sends
    const { email, username, name, password, phone } = req.body;

    // Resolves username whether frontend sends 'username' or 'name'
    const finalUsername = username || name;

    try {
        if (!email || !finalUsername || !password) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing required fields (email, name/username, or password)" 
            });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 10);

        // Store user data temporarily
        tempUserStore[email] = { 
            username: finalUsername, 
            password: hashedPassword, 
            phone: phone || '', 
            otp 
        };

        // Send OTP via Resend
        const { data, error } = await resend.emails.send({
            from: 'Sairam Tutorials <onboarding@resend.dev>',
            to: email, // Note: Free tier only sends to your own registered email address
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
            console.error("Resend Error:", error);
            return res.status(500).json({ 
                success: false, 
                message: "Email service failed. On Resend free tier, emails can only be sent to your registered account email." 
            });
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