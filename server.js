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
    connectionString: 'postgresql://neondb_owner:npg_H1pPu8CetkVj@ep-curly-sunset-a6py4mib-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require',
});

client.connect();

// Middleware to serve static files (if needed)
app.use(express.static('public'));  // Put your HTML file here

// Route to serve the HTML form
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Send all past messages when a user connects
    client.query('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10', (err, result) => {
        if (err) {
            console.error(err);
        } else {
            result.rows.forEach((message) => {
                socket.emit('receiveMessage', message);
            });
        }
    });

    // Listen for 'sendMessage' event
    socket.on('sendMessage', (messageData) => {
        const { sender, content } = messageData;
        client.query('INSERT INTO messages(sender, content) VALUES($1, $2)', [sender, content], (err, result) => {
            if (err) {
                console.error(err);
                socket.emit('messageStatus', { status: 'Error saving message' });
            } else {
                console.log('Message saved');
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
