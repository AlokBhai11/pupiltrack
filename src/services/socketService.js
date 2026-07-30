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
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.tenantId = decoded.tenantId;
        socket.role = decoded.role;
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
