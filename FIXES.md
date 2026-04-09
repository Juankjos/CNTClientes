# Cambios aplicados

1. **postcss.config.mjs** creado (Tailwind v4)
2. **src/app/globals.css** ahora contiene `@import "tailwindcss";`
3. **package.json**:
   - Agregado `@tailwindcss/postcss` en devDependencies
   - `build` ahora copia `.next/static` y `public` al standalone
   - Nuevo script `start:standalone` con HOSTNAME, PORT y --env-file

## Pasos en el servidor

```bash
rm -rf .next node_modules
npm install
npm run build
npm run start:standalone
```

## nginx (importante)

```nginx
location /CNTClientes/ {
    proxy_pass http://192.168.2.68:3000;   # SIN slash final
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## systemd (opcional, recomendado)

```ini
[Unit]
Description=CNT Clientes
After=network.target

[Service]
Type=simple
WorkingDirectory=/ruta/a/CNTClientes
EnvironmentFile=/ruta/a/CNTClientes/.env
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Asegurate que `.env` tenga `SESSION_SECRET` con mínimo 32 caracteres
(generar con: `openssl rand -hex 32`).
