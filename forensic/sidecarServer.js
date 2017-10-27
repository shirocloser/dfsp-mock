const net = require('net')
const ServerPort = 5678
let connections = new Set()
const socketServer = net.createServer((socket) => {
  socket.on('end', () => {})
  socket.on('data', (data) => {})
  socket.on('close', () => {
  })
})

socketServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    setTimeout(() => {
      socketServer.close()
      socketServer.listen(ServerPort)
    }, 1000)
  }
})

socketServer.on('connection', (socket) => {
  connections.add(socket)
})

module.exports = new Promise(function (resolve, reject) {
  socketServer.listen(ServerPort, (err) => {
    return err ? reject(err) : resolve()
  })
})
.then(() => {
  return {
    stop: function () {
      return new Promise(function (resolve, reject) {
        socketServer.close(function (err) {
          if (err) {
            return reject(err)
          }
          connections.forEach((connection) => connection.destroy())
          socketServer.unref()
          return resolve()
        })
        socketServer.emit('close')
      })
    }
  }
})
