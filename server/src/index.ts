import { createGameServer } from './app';

const port = Number(process.env.PORT) || 3001;
const { httpServer } = createGameServer();

httpServer.listen(port, () => {
  console.log(`Rabiscaí: servidor ouvindo em http://localhost:${port}`);
});
