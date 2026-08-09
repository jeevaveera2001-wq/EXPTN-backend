import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import apiRouter from './routes/api.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Database Connection
connectDB();

// API Router
app.use('/api', apiRouter);

// Socket.io Real-time Notifications Setup
io.on('connection', (socket) => {
  console.log(`⚡ Socket Client Connected: ${socket.id}`);
  
  socket.on('join_room', (room) => {
    socket.join(room);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Root Healthcheck
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'Explore Tamil Nadu Enterprise Backend API',
    time: new Date()
  });
});

server.listen(PORT, () => {
  console.log(`✨ Explore Tamil Nadu Backend Express Server running on http://localhost:${PORT}`);
});
