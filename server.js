const express = require('express');
const { Client } = require('pg');
const http = require('http');
const socketIo = require('socket.io');

// Create an instance of the Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// PostgreSQL client
const client = new Client({
    connectionString: 'your_neon_connection_string_here',
});

client.connect();

// Middleware to serve static files (if needed)
app.use(express.static('public'));  // Put your HTML file here

// Route to serve the HTML form
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Listen for new WebSocket connections
io.on('connection', (socket) => {
    console.log('A user connected');

    // Listen for 'sendMessage' event
    socket.on('sendMessage', (messageData) => {
        const { sender, content } = messageData;

        // Store the message in the database
        client.query('INSERT INTO messages(sender, content) VALUES($1, $2)', [sender, content], (err, result) => {
            if (err) {
                console.error(err);
                socket.emit('messageStatus', { status: 'Error saving message' });
            } else {
                console.log('Message saved');
                // Broadcast the new message to all connected clients
                io.emit('receiveMessage', { sender, content, timestamp: new Date().toISOString() });
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server
const port = 3000;
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
