# Partyman

Plataforma web para gestionar LAN parties en red local. Diseñada para grupos pequeños (10-15 personas) que se reúnen regularmente.

## Características

- **Autenticación Steam**: Los participantes se registran automáticamente al iniciar sesión con Steam
- **Gestión de parties**: Crear, activar y finalizar eventos
- **Torneos**: Sistema de torneos con brackets y seguimiento de resultados
- **Pantalla pública**: Vista en tiempo real del estado actual de la party (kiosk mode)
- **Historial**: Registro completo de parties anteriores, ganadores y estadísticas

## Requisitos

- **Bun** 1.4.0 o superior (runtime, bundler, tests y tipos; no hace falta Node.js)
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

Un solo proceso sirve API y frontend en el mismo puerto (sin cliente aparte).

### Desarrollo

```bash
# Servidor con hot reload
bun run dev

# Tras proxy o con el host check de Bun dando guerra
bun run dev:proxy
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

# Ejecutar con volúmenes persistentes (PUBLIC_ORIGIN = URL que abre el navegador)
docker run -d \
  --name partyman \
  --network host \
  -v "$PWD/data:/data" \
  -v "$PWD/uploads:/uploads" \
  -e PUBLIC_ORIGIN=http://192.168.1.100:8400 \
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
| `DATABASE_PATH` | Ruta de la base de datos | `/data/partyman.sqlite3` |
| `UPLOADS_PATH` | Ruta de archivos subidos | `/uploads` |
| `BACKUP_DIR` | Directorio de backups | `/data/backups` |
| `BACKUP_KEEP` | Copias a conservar | `20` |
| `ACCESS_PASSWORD` | Contraseña de acceso a la app (vacía = acceso libre) | - |
| `REPORT_TIMEOUT_MIN` | Minutos hasta auto-confirmar un resultado sin respuesta | `5` |
| `STEAM_API_KEY` | API key de Steam (sin ella, nombres locales) | - |
| `STEAM_ENABLED` | `false` desactiva el login Steam | `true` |
| `WIFI_SSID` / `WIFI_PASSWORD` | Muestra QR WiFi en el display | - |
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
│   ├── backend.ts           # Entry point (serve API + frontend, mismo puerto)
│   ├── backend/             # Backend (Bun, sin frameworks)
│   │   ├── auth/            # Steam, sesiones, guards, CSRF
│   │   ├── db/              # Conexión y runner de migraciones
│   │   ├── http/            # IDs y utilidades HTTP
│   │   ├── ops/             # Backups
│   │   ├── parties/         # Servicio de parties
│   │   ├── scoring/         # Puntos, logros, ranking
│   │   ├── tournaments/     # Bracket single-elimination
│   │   ├── routes/          # Endpoints API
│   │   └── middleware/      # CSRF global, rate limit, cabeceras
│   ├── frontend/            # React + wouter (se empaqueta al arrancar)
│   │   ├── components/      # AuthContext, ConfirmDialog, listRow, apiError…
│   │   └── pages/           # Dashboard, admin/*, tournaments/*, public/*…
│   ├── shared/              # Contratos API compartidos
│   └── public/              # CSS, fuentes, estáticos
├── migrations/          # Migraciones SQL (orden numérico)
├── tests/               # Bun test por dominio
├── scripts/             # qa-e2e.ts y utilidades
├── specs/               # Especificaciones del proyecto
├── docs/                # operations.md, qa-plan.md
├── AGENTS.md            # Guía para agentes IA
└── package.json
```

## API Endpoints

Contrato en `specs/README.md` (errores `{ error: { code, message } }`, CSRF
double-submit en writes con cookie, 401/403/404/409/422). Resumen por dominio:

- Públicos: `GET /api/health`, `GET /api/ready`, `GET /api/auth/config`,
  `GET /api/public/state`, `GET /display` (pantalla).
- Auth: `GET /auth/steam`, `GET /auth/steam/callback`,
  `POST /auth/admin/login`, `POST /auth/logout`, `GET /api/me`.
- Acceso: `POST /api/access` (puerta opcional con `ACCESS_PASSWORD`). El alta
  en la party activa es automática al iniciar sesión con Steam.
- Parties (admin): crear, activar, `finish`, archivar, borrar, wizard
  `POST /api/admin/parties/:id/close`, participantes y roles.
- Juegos: catálogo + búsqueda SGDB (`/api/games-search/*`).
- Propuestas: actividades y torneos (`/api/*-proposals`, votos, aprobar).
- Torneos: crear, unirse/salir, arrancar, `matches/:id/report`,
  confirmación de un toque del rival (`matches/:id/confirm`),
  disputas (`/api/disputes/:id/vote`), confirm admin. Un reporte sin
  respuesta se auto-confirma tras `REPORT_TIMEOUT_MIN` minutos.
- Puntos: leaderboards, historial, reglas, logros, premios, correcciones,
  cambio de contraseña (`POST /api/admin/password`).
- Backups: crear, listar, descargar, restaurar (`/api/admin/backups/*`).

## Tests

```bash
# Ejecutar todos los tests
bun test

# E2E contra servidor desechable (41 checks del plan QA)
bun scripts/qa-e2e.ts

# Typecheck
bun run typecheck
```

## Contribuir

### Flujo de trabajo

1. Lee las especificaciones en `specs/`
2. Revisa la tarea asignada en `specs/tasks/`
3. Implementa siguiendo las convenciones del código
4. Añade tests para nueva funcionalidad
5. Asegúrate de que `bun test`, `bun run typecheck` y `bun run build` pasen
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

El proyecto está dividido en tareas (ver `specs/tasks/`):

- **001–009**: MVP (bootstrap, auth, parties, display, juegos, torneos, puntos, backups, integración)
- **010–014**: Polish, seguridad, UX y modo autónomo
- **015–019**: Formatos de torneo, check-in, porras, más logros, display rotativo

Cada tarea declara goal, acceptance criteria, ficheros y non-goals en su
fichero, con sección `Estado actual`.

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

## Release checklist

Antes de una party con gente real:

```bash
bun run typecheck && bun test && bun run build
docker build -t partyman .
docker run --rm --network host \
  -v "$PWD/data:/data" -v "$PWD/uploads:/uploads" \
  -e PUBLIC_ORIGIN=http://127.0.0.1:8400 \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD_HASH="$ADMIN_PASSWORD_HASH" \
  partyman
```

- `GET /api/health` → 200 con el proceso escuchando; `GET /api/ready` → 200 solo con SQLite, migraciones y directorios escribibles.
- Gates manuales: login Steam con 2 cuentas reales, `/display` en proyector 16:9 y móvil, restore ensayado sobre una copia (ver `docs/operations.md`).
- Nada de secretos, DBs ni uploads en la imagen ni en Git.

## Licencia

MIT. Ver [`LICENSE`](LICENSE).

## Soporte

Para issues y preguntas, usa el sistema de issues del repositorio.
