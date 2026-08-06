const jwt = require('jsonwebtoken');

class SocketService {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // Map of userId -> Set of socket IDs
    this.setupMiddleware();
    this.setupHandlers();
  }

  setupMiddleware() {
    this.io.use((socket, next) => {
      let token = socket.handshake.auth.token;

      // The institute/student JWT lives in an httpOnly cookie, which
      // client-side JS can never read to pass explicitly. Fall back to
      // parsing it straight from the raw cookie header sent with the
      // socket handshake (works as long as the client connects with
      // withCredentials: true and CORS allows credentials).
      if (!token) {
        const cookieHeader = socket.handshake.headers.cookie || '';
        const cookies = Object.fromEntries(
          cookieHeader
            .split(';')
            .map((c) => c.trim().split('='))
            .filter((pair) => pair.length === 2)
        );
        token = cookies.studentToken || cookies.token;
      }

      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.tenantId = decoded.tenantId;
        socket.role = decoded.role;
        socket.className = decoded.className || null;
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });
  }

  setupHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected: ${socket.id}`);

      // Store user socket
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId).add(socket.id);

      // Join user's personal room for notifications
      socket.join(`user:${socket.userId}`);
      socket.join(`tenant:${socket.tenantId}`);
      if (socket.role === 'student' && socket.className) {
        socket.join(`class:${socket.tenantId}:${socket.className}`);
      }

      // Handle custom events
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected: ${socket.id}`);
        const sockets = this.userSockets.get(socket.userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.userSockets.delete(socket.userId);
          }
        }
      });

      socket.on('error', (error) => {
        console.error(`Socket error for user ${socket.userId}:`, error);
      });
    });
  }

  // Send notification to specific user
  notifyUser(userId, notification) {
    this.io.to(`user:${userId}`).emit('notification', notification);
  }

  // Send notification to all users in a tenant
  notifyTenant(tenantId, notification) {
    this.io.to(`tenant:${tenantId}`).emit('notification', notification);
  }

  // Send notification to specific role in a tenant
  notifyRole(tenantId, role, notification) {
    this.io.to(`tenant:${tenantId}`).emit('notification', {
      ...notification,
      __targetRole: role, // Client-side filtering
    });
  }

  // Send notification to all students of one class within a tenant
  notifyClass(tenantId, className, notification) {
    this.io.to(`class:${tenantId}:${className}`).emit('notification', notification);
  }

  // Broadcast real-time update
  broadcastUpdate(tenantId, eventType, data) {
    this.io.to(`tenant:${tenantId}`).emit('update', {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Send activity notification
  notifyActivity(tenantId, activity) {
    this.io.to(`tenant:${tenantId}`).emit('activity', activity);
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.userSockets.size;
  }

  // Get statistics
  getStats() {
    return {
      totalConnections: this.io.engine.clientsCount,
      totalOnlineUsers: this.userSockets.size,
      namespaces: Object.keys(this.io._nsps),
    };
  }
}

module.exports = SocketService;
