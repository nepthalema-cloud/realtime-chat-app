/**
 * Realtime Presence Manager for Single-Server Architecture
 * Tracks authenticated active Socket.IO connections per user.
 * Supports multiple tabs / devices per user.
 */
class PresenceManager {
  private userSockets: Map<string, Set<string>> = new Map();

  /**
   * Register a new socket connection for a user.
   * Returns whether this is the user's first active connection (offline -> online transition).
   */
  public addSocket(userId: string, socketId: string): { isFirst: boolean; count: number } {
    let sockets = this.userSockets.get(userId);
    let isFirst = false;

    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
      isFirst = true;
    }

    sockets.add(socketId);
    return { isFirst, count: sockets.size };
  }

  /**
   * Remove a disconnected socket for a user.
   * Returns whether this was the user's last connection (online -> offline transition).
   */
  public removeSocket(userId: string, socketId: string): { isLast: boolean; count: number } {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return { isLast: false, count: 0 };
    }

    sockets.delete(socketId);
    const count = sockets.size;
    let isLast = false;

    if (count === 0) {
      this.userSockets.delete(userId);
      isLast = true;
    }

    return { isLast, count };
  }

  /**
   * Check if a user is currently online (has at least 1 active socket).
   */
  public isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!(sockets && sockets.size > 0);
  }

  /**
   * Get all currently online user IDs.
   */
  public getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }

  /**
   * Clear all presence state (for testing/cleanup).
   */
  public clear(): void {
    this.userSockets.clear();
  }
}

export const presenceManager = new PresenceManager();
