import { io } from 'socket.io-client'

// In dev, Vite proxies /socket.io to the backend (see vite.config.js).
// In prod, the frontend is served by the same Express server.
const SOCKET_URL = window.location.origin

let socket

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000
    })
  }

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
