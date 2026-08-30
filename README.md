# Partyman

Plataforma web para gestionar LAN parties en red local. Diseñada para grupos pequeños (10-15 personas) que se reúnen regularmente.

## Características

- **Autenticación Steam**: Los participantes se registran automáticamente al iniciar sesión con Steam
- **Gestión de parties**: Crear, activar y finalizar eventos
- **Torneos**: Sistema de torneos con brackets y seguimiento de resultados
- **Pantalla pública**: Vista en tiempo real del estado actual de la party (kiosk mode)
- **Historial**: Registro completo de parties anteriores, ganadores y estadísticas

## Requisitos

- **Bun** 1.4.0 o superior
- **Node.js** 22.x (solo para desarrollo)
- **SQLite** (incluido en Bun)
- **Docker** (opcional, para despliegue)

## Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd partyman

# Instalar dependencias
bun install
```

## Ejecución

### Desarrollo

```bash
# Servidor con hot reload
bun run dev

# En otra terminal, cliente con hot reload
bun run dev:client
```

El servidor estará disponible en `http://localhost:8400`

### Producción

```bash
# Build completo
bun run build

# Iniciar servidor
bun run start
```

### Docker

```bash
# Build de la imagen
docker build -t partyman .

# Ejecutar con volúmenes persistentes
docker run -d \
  --name partyman \
  -p 8400:8400 \
  -v partyman-data:/data \
  -v partyman-uploads:/uploads \
  -e PUBLIC_ORIGIN=http://localhost:8400 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD_HASH=<bcrypt-hash> \
  partyman
```

## Variables de entorno

### Requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `PUBLIC_ORIGIN` | URL pública del servidor | `http://192.168.1.100:8400` |
| `ADMIN_USERNAME` | Usuario administrador | `admin` |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt de la contraseña | `$2a$10$...` |

### Opcionales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | `8400` |
| `HOST` | Host de escucha | `0.0.0.0` |
| `DATABASE_PATH` | Ruta de la base de datos | `/data/partyman.db` |
| `UPLOADS_PATH` | Ruta de archivos subidos | `/uploads` |
| `BACKUP_DIR` | Directorio de backups | `/data/backups` |
| `STEAM_API_KEY` | API key de Steam (opcional) | - |
| `COOKIE_SECURE` | Cookies solo HTTPS | `false` |

### Generar hash de contraseña

```bash
# Usando Bun
bun -e "console.log(await Bun.password.hash('tu-password', { algorithm: 'bcrypt', cost: 10 }))"
```

## Estructura del proyecto

```
partyman/
├── src/
│   ├── server/          # Backend (Bun)
│   │   ├── auth/        # Autenticación y sesiones
│   │   ├── db/          # Base de datos y migraciones
│   │   ├── http/        # Router y utilidades HTTP
│   │   ├── routes/      # Endpoints API
│   │   ├── app.ts       # Configuración de la app
│   │   └── index.ts     # Entry point
│   ├── client/          # Frontend (React)
│   │   ├── components/  # Componentes React
│   │   ├── pages/       # Páginas
│   │   ├── main.tsx     # Entry point
│   │   └── routes.tsx   # Rutas del cliente
│   └── shared/          # Código compartido
│       └── contracts/   # Tipos compartidos
├── migrations/          # Migraciones SQL
├── tests/               # Tests
├── specs/               # Especificaciones del proyecto
├── AGENTS.md            # Guía para agentes IA
└── package.json
```

## API Endpoints

### Públicos

- `GET /api/health` - Health check
- `GET /api/ready` - Readiness check
- `GET /api/auth/config` - Configuración pública

### Autenticación

- `GET /auth/steam` - Iniciar login con Steam
- `GET /auth/steam/callback` - Callback de Steam
- `POST /auth/admin/login` - Login de administrador
- `POST /auth/logout` - Logout

### Participantes

- `GET /api/me` - Usuario actual
- `GET /api/participants/me` - Perfil del participante

### Parties (requiere admin)

- `POST /api/admin/parties` - Crear party
- `PATCH /api/admin/parties/:id` - Actualizar party
- `POST /api/admin/parties/:id/activate` - Activar party
- `POST /api/admin/parties/:id/finish` - Finalizar party

## Tests

```bash
# Ejecutar todos los tests
bun test

# Tests con cobertura
bun test --coverage

# Typecheck
bun run typecheck

# Lint
bun run lint
```

## Contribuir

### Flujo de trabajo

1. Lee las especificaciones en `specs/`
2. Revisa la tarea asignada en `specs/tasks/`
3. Implementa siguiendo las convenciones del código
4. Añade tests para nueva funcionalidad
5. Asegúrate de que `bun run test`, `bun run typecheck` y `bun run lint` pasen
6. Crea un PR con descripción clara

### Convenciones

- **Backend**: TypeScript con Bun, sin frameworks
- **Frontend**: React + wouter para routing
- **Base de datos**: SQLite con migraciones versionadas
- **Tests**: Bun test framework
- **Estilo**: Código funcional, mínimo, sin abstracciones innecesarias

### Commits

Usa conventional commits:

```
feat: añadir sistema de torneos
fix: corregir cálculo de puntos
docs: actualizar README
test: añadir tests para auth
refactor: simplificar lógica de sesiones
```

### Tareas

El proyecto está dividido en tareas independientes (ver `specs/tasks/`):

- **001**: Bootstrap (completado)
- **002**: Autenticación (completado)
- **003**: Gestión de parties
- **004**: Pantalla pública
- **005**: Juegos y planificación
- **006**: Torneos
- **007**: Puntuaciones e historial
- **008**: Backups y operaciones
- **009**: Integración final

Cada tarea puede implementarse en paralelo siguiendo su especificación.

## Arquitectura

### Stack técnico

- **Runtime**: Bun (servidor + bundler)
- **Frontend**: React + wouter
- **Base de datos**: SQLite (bun:sqlite)
- **Autenticación**: Steam OpenID 2.0
- **Despliegue**: Docker con volúmenes persistentes

### Principios

- **Mínimo**: Sin dependencias innecesarias
- **Local**: Diseñado para red local
- **Simple**: Una sola imagen Docker, una sola base de datos
- **Seguro**: Validación en servidor, protección CSRF, sesiones con hash

## Licencia

Por definir.

## Soporte

Para issues y preguntas, usa el sistema de issues del repositorio.
