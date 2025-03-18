require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve login and signup pages
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// PostgreSQL client setup (Neon Database)
const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_H1pPu8CetkVj@ep-curly-sunset-a6py4mib-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require",
    ssl: { rejectUnauthorized: false }
});
client.connect();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

app.get('/messages', async (req, res) => {
    const afterId = parseInt(req.query.afterId) || 0;

    try {
        const result = await client.query(
            'SELECT * FROM messages WHERE id > $1 ORDER BY created_at ASC', [afterId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).send('Internal Server Error');
    }
});


// Route to register user
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await client.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        res.json({ user: result.rows[0], message: "User registered successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Username might already be taken" });
    }
});

// Route to login user
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// Middleware to authenticate token
function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(403).json({ error: "Access denied" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
}

app.post('/sendMessage', authenticateToken, async (req, res) => {
    const { content } = req.body;
    const userId = req.user.userId;
    const username = req.user.username; // Get username from JWT token

    if (!content.trim()) {
        return res.status(400).json({ error: "Message cannot be empty!" });
    }

    try {
        await client.query(
            'INSERT INTO messages (user_id, sender, content) VALUES ($1, $2, $3)',
            [userId, username, content]
        );

        io.emit('receiveMessage', { sender: username, content, timestamp: new Date().toISOString() });

        res.json({ success: true });
    } catch (err) {
        console.error("Error saving message:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// Create HTTP server and WebSocket server
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// WebSocket logic
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('sendMessage', async (messageData) => {
        const { token, content } = messageData;

        try {
            const user = jwt.verify(token, JWT_SECRET);
            await client.query(
                'INSERT INTO messages (user_id, content) VALUES ($1, $2)',
                [user.userId, content]
            );

            io.emit('receiveMessage', { sender: user.username, content, timestamp: new Date().toISOString() });
        } catch (err) {
            console.error("Error saving message:", err);
            socket.emit('messageStatus', { status: "Failed to send message" });
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
