# 🔐 Sistema de Autenticación - Configuración

Este documento explica cómo configurar y usar el sistema de login seguro del panel administrativo.

---

## 📋 Pasos de Configuración

### **Paso 1: Crear la tabla de usuarios en Supabase**

1. Abre tu proyecto en [Supabase](https://supabase.com)
2. Abre el **SQL Editor** (Menú izquierdo → SQL)
3. Copia todo el contenido de `supabase/migrations/crear_usuarios.sql`
4. Pégalo en el editor y ejecuta (botón "Run")

Esto crea:
- Tabla `usuarios` con campos: nombre_usuario, tipo_usuario, clave_hash, activo, etc.
- Índices para búsquedas rápidas
- Políticas de seguridad (RLS)

---

### **Paso 2: Crear el primer usuario administrador**

En el **SQL Editor** de Supabase, ejecuta:

```sql
INSERT INTO usuarios (nombre_usuario, tipo_usuario, clave_hash, activo)
VALUES (
  'admin',
  'administrador',
  'admin123', -- En producción, usar bcrypt o contraseña hasheada
  true
);
```

**Campos:**
- `nombre_usuario`: El nombre que usa para login (ej: "admin")
- `tipo_usuario`: Siempre "administrador" (por ahora)
- `clave_hash`: La contraseña (en desarrollo, en producción hasheada con bcrypt)
- `activo`: true/false (para desactivar usuarios)

---

### **Paso 3: Acceder al panel**

1. Abre `vista/login.html` en tu navegador
2. Ingresa:
   - **Usuario**: admin
   - **Contraseña**: admin123
   - **Tipo de Usuario**: Administrador
3. Click en **Ingresar**

✅ Si todo está bien, redirige a `panel.html`

---

## 🔒 Cómo funciona la seguridad

### **Flujo de login:**

```
Usuario ingresa credenciales
         ↓
VistaLogin.js valida en Supabase
         ↓
Si son correctas:
  - Genera JWT (token)
  - Guarda en localStorage
  - Redirige a panel.html
         ↓
Panel.html verifica token
         ↓
Si existe → muestra contenido
Si NO existe → redirige a login.html
```

### **Protección:**

- ✅ Validación en cliente (JavaScript)
- ✅ Validación en servidor (Supabase RLS policies)
- ✅ Sesión con JWT (token válido 24 horas)
- ✅ Botón "Salir" limpia sesión
- ⚠️ TODO: Hash bcrypt en producción

---

## 📱 Acceso desde móvil y tablet

El sistema es **responsive**:
- **Móvil**: Login optimizado, panel también funciona (aunque mejor en tablet)
- **Tablet**: Panel ideal, formularios grandes
- **Computador**: Pantalla completa

---

## 🚀 Próximos pasos (Producción)

Cuando el cliente diga "adelante", antes de lanzar:

### **1. Mejorar contraseñas:**
```javascript
// Instalar bcrypt.js en el proyecto
npm install bcryptjs

// En VistaLogin.js, al crear usuario:
const hashedPassword = await bcrypt.hash(password, 10);
```

### **2. Migrar a PHP + MySQL:**
- Crear API REST en PHP
- Validación en servidor (más segura)
- Sesiones PHP tradicionales o JWT

### **3. SSL/HTTPS:**
- Asegurar conexión en producción
- Hosting con certificado SSL

### **4. Agregar más usuarios:**
- Panel de gestión de usuarios
- Roles y permisos
- Auditoría de accesos

---

## 🧪 Testing

### **Probar que está protegido:**

1. Limpia localStorage en DevTools
   ```javascript
   localStorage.clear()
   ```

2. Intenta acceder a `panel.html`
   → Debe redirigir a `login.html` ✅

3. Intenta login con credenciales incorrectas
   → Debe mostrar error ✅

4. Intenta login correcto
   → Debe entrar a panel ✅

5. Cierra sesión (botón "Salir")
   → Regresa a login ✅

---

## 🛠️ Solución de problemas

### **"Usuario no encontrado"**
- Verifica que ejecutaste el INSERT del usuario en Supabase
- Revisa que el nombre_usuario coincida exactamente

### **"Error de conexión"**
- Verifica que la URL y KEY de Supabase en `conexion_db.js` sean correctas
- Abre DevTools → Network para ver qué error devuelve Supabase

### **Página blanca sin redirect**
- Abre DevTools → Console para ver errores
- Verifica que `VistaLogin.js` está cargando correctamente

---

## 📚 Archivos relacionados

- `vista/login.html` — Formulario de login
- `vista/VistaLogin.js` — Lógica de autenticación
- `vista/panel.html` — Panel protegido (modificado)
- `supabase/migrations/crear_usuarios.sql` — Tabla de usuarios
- `conexion_db.js` — Conexión a Supabase

---

¿Preguntas? Revisa el código en VistaLogin.js, tiene comentarios detallados. 🚀
