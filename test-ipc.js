const ipc = require('node-ipc');

// Configure IPC based on platform
function configureIpc() {
    if (process.platform === 'win32') {
        ipc.config.socketRoot = '\\\\.\\pipe\\';
        ipc.config.appspace = '';
    } else {
        // Unix-like systems (Linux, macOS)
        ipc.config.socketRoot = '/tmp/';
        ipc.config.appspace = 'app.';
    }
}

ipc.config.id = 'bot';
ipc.config.retry = 1500;
ipc.config.silent = true;

configureIpc();

console.log('Platform:', process.platform);
console.log('Socket path:', ipc.config.socketRoot + ipc.config.appspace + ipc.config.id);

ipc.serve(function () {
    console.log('IPC server started successfully!');

    ipc.server.on('test', (data, socket) => {
        console.log('Received test message:', data);
        ipc.server.emit(socket, 'test-response', 'Server is working!');
    });
});

ipc.server.start();

console.log('Server should be listening...');

// Keep the process running for 5 seconds to test
setTimeout(() => {
    console.log('Shutting down test server...');
    ipc.server.stop();
    process.exit(0);
}, 5000);
