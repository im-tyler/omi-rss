# Omi RSS Server

A comprehensive RSS feed aggregator server built with Serverpod and Dart.

## Features

- **Feed Management**: Subscribe to RSS, Atom, and JSON feeds
- **Authentication**: JWT-based authentication with refresh tokens
- **User Management**: User profiles, preferences, and statistics
- **Folder Organization**: Organize feeds into hierarchical folders
- **Real-time Updates**: WebSocket support for market data and live updates
- **Analytics**: Track reading habits and user engagement
- **AI Integration**: Extract insights and generate summaries (coming soon)

## Prerequisites

- Dart SDK (>= 3.0.0)
- PostgreSQL (>= 14.0)
- Redis (optional, for caching)

## Installation

1. **Clone the repository**
   ```bash
   cd omi_rss_server
   ```

2. **Install dependencies**
   ```bash
   dart pub get
   ```

3. **Set up the database**
   
   Create a PostgreSQL database:
   ```sql
   CREATE DATABASE omi_rss;
   ```
   
   Run migrations:
   ```bash
   dart run serverpod:migrate
   ```
   
   Or manually run the SQL scripts in the `migrations/` folder.

4. **Configure the server**
   
   Create a `config/development.yaml` file:
   ```yaml
   apiServer:
     port: 8080
     publicHost: localhost
     publicPort: 8080
     publicScheme: http
   
   webServer:
     port: 8081
     publicHost: localhost
     publicPort: 8081
     publicScheme: http
   
   database:
     host: localhost
     port: 5432
     name: omi_rss
     user: postgres
     password: your_password
   
   auth:
     jwtSecret: your-super-secret-jwt-key-change-this
     sendValidationEmail: false
     allowRegistration: true
     requireEmailValidation: false
     tokenLifetimeHours: 24
     refreshTokenLifetimeHours: 720
   
   redis:
     enabled: false
     host: localhost
     port: 6379
   ```

5. **Generate protocol**
   ```bash
   dart run serverpod:generate
   ```

## Running the Server

### Development Mode

```bash
dart run bin/main.dart
```

### Production Mode

```bash
dart compile exe bin/main.dart -o omi_rss_server
./omi_rss_server --mode production
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Feed Management

- `GET /api/feed` - List user's feeds
- `POST /api/feed` - Subscribe to a new feed
- `PUT /api/feed/:id` - Update feed settings
- `DELETE /api/feed/:id` - Unsubscribe from feed
- `POST /api/feed/refresh` - Manually refresh feeds

### Article Management

- `GET /api/article` - List articles
- `GET /api/article/:id` - Get article details
- `POST /api/article/:id/read` - Mark article as read
- `POST /api/article/:id/star` - Star/unstar article
- `POST /api/article/:id/save` - Save article

### Folder Management

- `GET /api/folder` - List folders
- `POST /api/folder` - Create folder
- `PUT /api/folder/:id` - Update folder
- `DELETE /api/folder/:id` - Delete folder

### User Management

- `GET /api/user/me` - Get current user profile
- `PUT /api/user/profile` - Update profile
- `GET /api/user/preferences` - Get preferences
- `PUT /api/user/preferences` - Update preferences
- `GET /api/user/statistics` - Get user statistics

### Analytics

- `POST /api/analytics/event` - Track event
- `GET /api/analytics/reading` - Get reading analytics
- `GET /api/analytics/feeds` - Get feed performance

### WebSocket

- `ws://localhost:8080/market` - Real-time market data

## Environment Variables

You can override configuration using environment variables:

- `DATABASE_HOST` - Database host
- `DATABASE_PORT` - Database port
- `DATABASE_NAME` - Database name
- `DATABASE_USER` - Database user
- `DATABASE_PASSWORD` - Database password
- `JWT_SECRET` - JWT secret key
- `API_PORT` - API server port
- `WEB_PORT` - Web server port

## Docker Deployment

Build the Docker image:
```bash
docker build -t omi-rss-server .
```

Run with Docker Compose:
```bash
docker-compose up -d
```

## Testing

Run tests:
```bash
dart test
```

## Architecture

The server follows a modular architecture:

- **Endpoints**: API request handlers
- **Middleware**: Authentication, rate limiting, logging
- **Services**: Business logic and external integrations
- **Models**: Database models and DTOs
- **WebSocket**: Real-time communication handlers
- **Utils**: Helper functions and utilities

## Security

- JWT authentication with refresh tokens
- Password hashing with BCrypt
- Rate limiting per endpoint
- SQL injection protection
- CORS configuration
- Input validation

## Performance

- Database query optimization with indexes
- Connection pooling
- Optional Redis caching
- Lazy loading for feeds
- Background job processing

## Monitoring

The server includes:
- Structured logging
- Performance metrics
- Health check endpoint (`/health`)
- Error tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT License