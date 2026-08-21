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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

// Attach socket.io instance to Express app for route emission
app.set('io', io);

const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// Database Connection
connectDB();
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// API Router
app.use('/api', apiRouter);

// Socket.io Real-time Connection & Rooms
io.on('connection', (socket) => {
  console.log(`⚡ [LIVE SOCKET CONNECTED] Client ID: ${socket.id}`);
  
  socket.on('join_room', (room) => {
    socket.join(room);
  });

  socket.on('request_stats', async () => {
    try {
      // emit current stats back
      socket.emit('stats_refreshed');
    } catch (e) {}
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Root Healthcheck
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    system: 'Explore Tamil Nadu Live WebSocket Enterprise API',
    time: new Date()
  });
});

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`✨ Explore Tamil Nadu Backend Express Server running on http://localhost:${PORT}`);
  });
}

export default app;
