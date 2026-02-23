# Ancient Board Games Platform

A mobile-friendly web application for playing ancient and classic board games online with multiplayer support. Play with friends without registration - just create a session and share the code!

## Features

- 🎲 **Six Games**: Royal Game of Ur, Senet, Nine Men's Morris, Wolves & Ravens, Rock-Paper-Scissors, and Stellar Siege
- 👥 **Multiplayer**: Real-time gameplay using Socket.io
- 📱 **Mobile-Friendly**: Responsive design with touch controls
- 🚀 **No Registration**: Guest play with display names
- 🔄 **Real-time Updates**: Instant game state synchronization
- 🏆 **Tournaments**: Bo1/Bo3/Bo5/Bo7 and round-robin formats
- 🐳 **Containerized**: Docker and Kubernetes ready
- 💬 **In-Game Chat**: Real-time chat during sessions
- 🔒 **Production Ready**: Health checks, TLS, and resource limits

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript + Socket.io
- **Database**: MongoDB
- **Deployment**: Docker + Kubernetes + Traefik

## Project Structure

```
/
├── frontend/          # React application
├── backend/           # Express server + game engines
├── shared/            # Shared TypeScript types
├── k8s/              # Kubernetes manifests
├── Dockerfile        # Multi-stage container build
└── docker-compose.yml # Local development setup
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (or use Docker Compose)
- npm

### Local Development

1. **Install dependencies**

```bash
npm install
```

2. **Setup environment variables**

Create `backend/.env` from the example:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your MongoDB connection string.

3. **Start MongoDB** (if not using external service)

```bash
docker run -d -p 27017:27017 --name mongodb mongo:7
```

4. **Start the development servers**

In separate terminals:

```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend
npm run dev:frontend
```

5. **Access the application**

Open http://localhost:5173 in your browser.

### Using Docker Compose

The easiest way to run the full stack locally:

```bash
# Build and start all services
docker-compose up --build

# Access the application
open http://localhost:3000
```

To stop:

```bash
docker-compose down
```

## Building for Production

### Build Docker Image

```bash
docker build -t ancient-games:latest .
```

### Run Docker Container

```bash
docker run -d \
  -p 3000:3000 \
  -e MONGODB_URI=mongodb://your-mongodb:27017/ancient-games \
  -e NODE_ENV=production \
  ancient-games:latest
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.19+)
- kubectl configured
- Traefik ingress controller
- cert-manager (for TLS certificates)

### Deploy to Kubernetes

1. **Build and push Docker image**

```bash
docker build -t your-registry/ancient-games:latest .
docker push your-registry/ancient-games:latest
```

2. **Update image in deployment**

Edit `k8s/deployment.yaml` and update the image field:

```yaml
image: your-registry/ancient-games:latest
```

3. **Update domain in ingress**

Edit `k8s/ingress.yaml` and replace `games.yourdomain.com` with your domain.

4. **Deploy MongoDB (optional)**

For development/testing, you can deploy MongoDB in-cluster:

```bash
kubectl apply -f k8s/mongodb.yaml
```

For production, use MongoDB Atlas or a managed service, and update the secret in `k8s/deployment.yaml`.

5. **Deploy the application**

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

6. **Verify deployment**

```bash
# Check pods
kubectl get pods

# Check service
kubectl get svc

# Check ingress
kubectl get ingress

# View logs
kubectl logs -l app=ancient-games
```

7. **Scale deployment**

```bash
kubectl scale deployment ancient-games --replicas=3
```

### TLS Certificate

The ingress is configured to use cert-manager with Let's Encrypt. Ensure you have cert-manager installed:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

Create a ClusterIssuer for Let's Encrypt:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: traefik
```

Apply it:

```bash
kubectl apply -f cluster-issuer.yaml
```

## Game Rules

### Royal Game of Ur

- **Players**: 2
- **Pieces**: 7 per player
- **Dice**: 4 binary dice (0-4 result)
- **Board**: 20 squares with special rosette squares
- **Objective**: First to get all pieces off the board wins
- **Special**: Landing on a rosette gives an extra turn and safe space (except middle rosette which allows captures)

### Senet

- **Players**: 2
- **Pieces**: 5 per player starting on alternating squares
- **Dice**: 4 stick dice (0-5 result)
- **Board**: 30 squares in S-shaped path
- **Objective**: First to get all pieces off the board wins
- **Special Squares**:
  - House of Rebirth (14): Captured pieces restart here
  - House of Beauty (25): Need exact roll to leave
  - House of Water (26): Returns piece to House of Rebirth
- **Extra Turns**: Rolling 1, 4, or 5 gives another turn

## Architecture

### Modular Game System

The platform uses an abstract `GameEngine` interface that makes adding new games easy:

```typescript
interface GameEngine {
  gameType: string;
  playerCount: number;
  initializeBoard(): BoardState;
  rollDice(): number;
  validateMove(board, move, player): boolean;
  applyMove(board, move): BoardState;
  checkWinCondition(board): number | null;
  getValidMoves(board, player, diceRoll): Move[];
}
```

To add a new game:

1. Create `backend/src/games/[gamename]/[GameName]Game.ts` implementing `GameEngine`
2. Register in `GameRegistry.ts`
3. Create frontend component in `frontend/src/components/games/[gamename]/`
4. Add route in `GameRoom.tsx`

### Real-time Communication

Socket.io events:

**Client → Server**:

- `session:join` - Join game session
- `session:leave` - Leave session
- `session:ready` - Toggle ready status
- `game:start` - Start game (host only)
- `game:roll-dice` - Roll dice
- `game:move` - Make a move
- `game:skip-turn` - Skip turn

**Server → Client**:

- `session:updated` - Session state changed
- `game:started` - Game started
- `game:dice-rolled` - Dice rolled
- `game:move-made` - Move made
- `game:turn-changed` - Turn changed
- `game:ended` - Game finished
- `game:error` - Error occurred

## Monitoring

### Health Checks

The application exposes a health endpoint:

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Logs

In Kubernetes:

```bash
# View logs
kubectl logs -f deployment/ancient-games

# View logs from all replicas
kubectl logs -l app=ancient-games --all-containers=true -f
```

## Development

### Workspace Structure

This is a monorepo using npm workspaces:

- `frontend` - React application
- `backend` - Express server
- `shared` - Shared TypeScript types

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build:frontend
npm run build:backend
```

### Type Safety

The `shared` package contains TypeScript interfaces used by both frontend and backend, ensuring type safety across the entire application.

## Troubleshooting

### MongoDB Connection Issues

If you see `MongooseServerSelectionError`:

1. Check MongoDB is running: `docker ps`
2. Verify connection string in `.env`
3. Check network connectivity

### Socket.io Connection Failures

1. Ensure CORS is configured correctly
2. Check firewall settings
3. Verify WebSocket support in proxy/ingress

### Build Failures

Clear node_modules and reinstall:

```bash
rm -rf node_modules frontend/node_modules backend/node_modules shared/node_modules
npm install
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Future Enhancements

- User accounts and game history
- Game replays
- Additional games (Mancala, etc.)
- AI opponents
- Sound effects and animations
