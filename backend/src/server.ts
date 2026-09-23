import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { initSocket } from './lib/socket';

const port = Number(process.env.PORT ?? 4000);

const app = createApp();
const server = http.createServer(app);

initSocket(server);

server.listen(port, () => {
  console.log(`API listening on port ${port}`);
});