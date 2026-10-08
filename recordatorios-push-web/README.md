# 🔔 Recordatorios Push Universales (PWA + Web Push)

Aplicación web completa, moderna y 100% gratuita para programar recordatorios en fecha/hora específica y recibir notificaciones push en **todos tus dispositivos** (Windows, Android, Mac, iPhone, iPad, tablets) incluso cuando el navegador o la aplicación estén cerrados.

Incluye el botón de prueba inicial para **enviar una notificación simultánea a todos los dispositivos registrados**.

---

## 📌 ¿Por qué no funciona únicamente con GitHub Pages?

**GitHub Pages es un alojamiento de archivos estáticos (solo HTML, CSS y JS en el navegador).**
Para que una notificación llegue a las 3:00 PM cuando tu teléfono está bloqueado o tu computadora está apagada/cerrada, o para que un dispositivo le envíe notificaciones a los demás:

1. **Se requiere un servidor (Backend):** Debe almacenar de forma segura las direcciones de suscripción de cada dispositivo (`subscriptions.json`).
2. **Se requiere un programador (Scheduler / Cron):** Debe estar en la nube revisando cada minuto si ya llegó la hora del recordatorio.
3. **Protocolo Web Push (VAPID):** El servidor debe firmar criptográficamente el mensaje y enviarlo a los servidores de notificación push de cada fabricante:
   - **Apple (APNs)** para iPhone, iPad y Safari en Mac.
   - **Google (FCM)** para Chrome y teléfonos Android.
   - **Mozilla** para Firefox.
   - **Microsoft** para Edge / Windows.

### 💡 La solución 100% Gratuita:
Puedes elegir entre dos configuraciones sencillas:
- **Opción A (Recomendada - La más simple):** Subir todo el proyecto (Frontend + Backend juntos) a un servicio gratuito como **Render.com** o **Glitch.com**. Te da una URL HTTPS directa, lista en 2 minutos y sin costo alguno.
- **Opción B (Híbrida con GitHub Pages):** Subes la carpeta `public/` a **GitHub Pages** y el archivo `server.js` a **Render.com** (o Glitch). En la app web simplemente indicas la URL de tu backend.

---

## 🚀 Opción 1: Despliegue en Render.com (100% Gratuito y Recomendado)

Render ofrece alojamiento web gratuito con HTTPS automático (imprescindible para notificaciones push):

1. **Crea un repositorio en GitHub:**
   - Sube todos los archivos de esta carpeta a un nuevo repositorio privado o público en GitHub (por ejemplo, `recordatorios-push`).
2. **Entra a [Render.com](https://render.com/)** y regístrate gratis con tu cuenta de GitHub.
3. Haz clic en **New +** > **Web Service**.
4. Selecciona tu repositorio de GitHub `recordatorios-push`.
5. Completa la configuración básica:
   - **Name:** `mis-recordatorios` (o el nombre que prefieras).
   - **Runtime:** `Node`.
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
6. Haz clic en **Create Web Service**.
7. En 1-2 minutos tendrás tu enlace listo: `https://mis-recordatorios.onrender.com`.

> **Tip para el plan gratuito de Render:** Los servidores gratuitos de Render se suspenden tras 15 minutos de inactividad para ahorrar recursos. Para mantenerlo siempre despierto y puntual, crea un monitor gratuito en [cron-job.org](https://cron-job.org/) que haga una petición `GET` a `https://mis-recordatorios.onrender.com/api/status` cada 10 minutos.

---

## 🌐 Opción 2: Frontend en GitHub Pages + Backend en la nube

Si deseas que la interfaz viva en `tuusuario.github.io/recordatorios`:

1. Despliega el backend en Render.com siguiendo los pasos anteriores para obtener tu URL de API (ej. `https://tu-backend.onrender.com`).
2. Sube el contenido de la carpeta `public/` a la rama `gh-pages` o raíz de tu repositorio en GitHub Pages.
3. Abre tu sitio en GitHub Pages:
   - Pulsa el botón superior **⚙️ Backend**.
   - Ingresa la URL de tu backend (`https://tu-backend.onrender.com`) y presiona **Guardar**.
   - ¡Listo! Todo quedará vinculado.

---

## 📱 Cómo activar y recibir notificaciones en cada dispositivo

Abre la URL de tu app en cada uno de tus dispositivos y sigue estos pasos:

### 🍎 En iPhone y iPad (iOS 16.4 o superior):
Por normativas de seguridad de Apple, las notificaciones Web Push requieren instalar la PWA:
1. Abre el enlace en **Safari**.
2. Pulsa el botón **Compartir** (icono de cuadrado con flecha hacia arriba en la barra inferior).
3. Desliza hacia abajo y selecciona **"Añadir a la pantalla de inicio"**.
4. Cierra Safari y abre la nueva app desde el icono en tu pantalla de inicio.
5. Asigna un nombre a tu dispositivo (ej. *"Mi iPhone 15"*) y pulsa **"Activar Notificaciones"**.
6. Acepta el cuadro de diálogo de iOS: *"¿Deseas permitir que 'Recordatorios' te envíe notificaciones?"*.

### 🤖 En Android:
1. Abre el enlace en **Google Chrome**, **Edge** o **Samsung Internet**.
2. Pulsa **"Activar Notificaciones"** y presiona **"Permitir"**.
3. Opcionalmente, pulsa el botón **"📲 Instalar App"** para tenerla como app independiente.

### 💻 En Windows y Mac:
1. Abre el enlace en Chrome, Edge, Firefox o Safari.
2. Nombra tu equipo (ej. *"PC Trabajo"*, *"MacBook"*) y pulsa **"Activar Notificaciones"**.
3. Acepta los permisos del navegador.
   - *Nota Windows:* Verifica que el "Asistente de concentración" no tenga las notificaciones silenciadas.
   - *Nota Mac:* En *Ajustes del Sistema > Notificaciones*, asegúrate de que tu navegador tenga permitidas las tiras/alertas.

---

## 🧪 Cómo realizar la prueba inicial

1. Abre la aplicación en tu computadora y en tu teléfono.
2. Activa las notificaciones en ambos dispositivos (verás que la sección **"Dispositivos Registrados"** muestra ambos equipos con sus nombres).
3. En cualquiera de los dos dispositivos, presiona el botón grande:
   **🔔 Enviar Notificación a Todos los Dispositivos**
4. Inmediatamente sonará y vibrará la notificación push en **todos los equipos registrados**.

---

## ⚙️ Estructura del Proyecto

```text
├── server.js            # Servidor Node.js Express, Web Push VAPID y Cron Scheduler
├── package.json         # Dependencias (express, web-push, cors)
├── data/                # Base de datos ligera en JSON (persistente)
│   ├── subscriptions.json # Lista de dispositivos suscritos
│   ├── reminders.json     # Recordatorios pendientes y enviados
│   └── vapid.json         # Claves criptográficas generadas automáticamente
└── public/              # Frontend PWA (compatible con GitHub Pages y navegadores)
    ├── index.html       # Interfaz moderna, responsive y con dark mode
    ├── app.js           # Lógica cliente, registro Web Push y llamadas a la API
    ├── sw.js            # Service Worker que recibe y muestra las notificaciones
    ├── style.css        # Estilos modernos
    ├── manifest.json    # Manifiesto PWA para instalación en iOS/Android
    └── icons/           # Iconos de la aplicación en 192x192 y 512x512
```
