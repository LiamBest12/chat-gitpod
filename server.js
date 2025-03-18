require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const { Pool } = require('pg');
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

// Middleware to authenticate users based on JWT token
function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1]; // Get the token from the Authorization header

    if (!token) {
        return res.status(403).json({ error: "Access denied, token missing!" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid token" });
        }
        req.user = user; // Attach user information to the request object
        next(); // Proceed to the next middleware or route handler
    });
}


// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL client setup (Neon Database)
const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_H1pPu8CetkVj@ep-curly-sunset-a6py4mib-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require",
    ssl: { rejectUnauthorized: false }
});
client.connect();

// Route to get all messages
app.get('/messages', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM messages ORDER BY created_at ASC');
        res.json(result.rows); // Return messages as JSON
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to handle sending a new message
app.post('/sendMessage', authenticateToken, async (req, res) => {
    const { token, content } = req.body;

    try {
        // Verify user from token
        const user = jwt.verify(token, JWT_SECRET);

        // Insert the new message into the database
        await client.query(
            'INSERT INTO messages (user_id, content) VALUES ($1, $2)',
            [user.userId, content]
        );

        // Emit the message to all connected users via WebSocket
        io.emit('receiveMessage', { sender: user.username, content, timestamp: new Date().toISOString() });

        res.status(200).send('Message sent successfully!');
    } catch (err) {
        console.error("Error sending message:", err);
        res.status(500).send('Failed to send message');
    }
});


// Create HTTP server and WebSocket server
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// WebSocket Chat Logic
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle incoming messages
    socket.on('sendMessage', async (messageData) => {
        const { token, content } = messageData;

        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            await client.query(
                'INSERT INTO messages (user_id, content) VALUES ($1, $2)',
                [user.userId, content]
            );

            // Emit the new message to all connected clients
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
