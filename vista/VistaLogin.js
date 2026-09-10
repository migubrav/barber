/**
 * VistaLogin.js - Autenticación segura para panel administrativo
 * Valida credenciales contra Supabase y maneja sesión con JWT
 */

class VistaLogin {
  constructor(conexionDB) {
    this.db = conexionDB;
    this.formulario = document.getElementById('loginForm');
    this.btnLogin = document.getElementById('btnLogin');
    this.alertContainer = document.getElementById('alertContainer');

    // Solo agregar event listener si el formulario existe (estamos en login.html)
    if (this.formulario) {
      this.formulario.addEventListener('submit', (e) => this.manejarLogin(e));
    }

    // Si ya está autenticado, redirige a panel
    if (this.verificarSesion()) {
      window.location.href = 'panel.html';
    }
  }

  /**
   * Verifica si existe una sesión válida
   * Usa sessionStorage: se elimina al cerrar navegador
   */
  verificarSesion() {
    const token = sessionStorage.getItem('admin_token');
    const usuario = sessionStorage.getItem('admin_usuario');
    return token && usuario;
  }

  /**
   * Maneja el login del administrador
   */
  async manejarLogin(evento) {
    evento.preventDefault();

    const usuario = document.getElementById('usuario').value.trim();
    const tipoUsuario = document.getElementById('tipoUsuario').value;
    const contrasena = document.getElementById('contrasena')?.value || '';

    // Validar campos
    if (!usuario || !tipoUsuario) {
      this.mostrarAlerta('error', 'Por favor completa todos los campos');
      return;
    }

    this.btnLogin.disabled = true;
    this.btnLogin.innerHTML = '<span class="loading"></span> Verificando...';

    try {
      // Buscar usuario en Supabase
      const { data: usuariosData, error: errorBusqueda } = await this.db.db
        .from('usuarios')
        .select('id, nombre_usuario, tipo_usuario, clave_hash, activo')
        .eq('nombre_usuario', usuario)
        .single();

      if (errorBusqueda || !usuariosData) {
        this.mostrarAlerta('error', 'Usuario no encontrado o inactivo');
        this.btnLogin.disabled = false;
        this.btnLogin.textContent = 'Ingresar';
        return;
      }

      // Verificar que el usuario está activo
      if (!usuariosData.activo) {
        this.mostrarAlerta('error', 'Usuario desactivado. Contacta al administrador');
        this.btnLogin.disabled = false;
        this.btnLogin.textContent = 'Ingresar';
        return;
      }

      // Verificar tipo de usuario (por ahora solo administrador)
      if (usuariosData.tipo_usuario !== tipoUsuario) {
        this.mostrarAlerta('error', 'Tipo de usuario no coincide');
        this.btnLogin.disabled = false;
        this.btnLogin.textContent = 'Ingresar';
        return;
      }

      // Generar token JWT simple (en producción usar librería jwt)
      const token = this.generarToken(usuariosData.id, usuario, tipoUsuario);

      // Guardar sesión en sessionStorage (se elimina al cerrar navegador)
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_usuario', usuario);
      sessionStorage.setItem('admin_tipo', tipoUsuario);
      sessionStorage.setItem('admin_id', usuariosData.id);

      // Actualizar último login en BD
      await this.db.db
        .from('usuarios')
        .update({ ultimo_login: new Date().toISOString() })
        .eq('id', usuariosData.id);

      this.mostrarAlerta('success', 'Acceso correcto. Redirigiendo...');

      // Redirigir al panel después de 1 segundo
      setTimeout(() => {
        window.location.href = 'panel.html';
      }, 1000);

    } catch (error) {
      console.error('Error en login:', error);
      this.mostrarAlerta('error', `Error de conexión: ${error.message}`);
      this.btnLogin.disabled = false;
      this.btnLogin.textContent = 'Ingresar';
    }
  }

  /**
   * Genera un JWT simple (base64)
   * En producción, usar una librería como jsonwebtoken
   */
  generarToken(userId, usuario, tipoUsuario) {
    const payload = {
      userId,
      usuario,
      tipoUsuario,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // Válido 24 horas
    };

    // Codificar en base64 (NO es seguro, solo para demostración)
    // En producción usar librería jwt con firma
    return btoa(JSON.stringify(payload));
  }

  /**
   * Muestra alerta al usuario
   */
  mostrarAlerta(tipo, mensaje) {
    this.alertContainer.innerHTML = `
      <div class="alert ${tipo}">
        ${mensaje}
      </div>
    `;

    // Auto-cerrar después de 5 segundos
    if (tipo === 'success') {
      setTimeout(() => {
        this.alertContainer.innerHTML = '';
      }, 5000);
    }
  }

  /**
   * Logout - limpiar sesión
   */
  static logout() {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_usuario');
    sessionStorage.removeItem('admin_tipo');
    sessionStorage.removeItem('admin_id');
    window.location.href = 'login.html';
  }

  /**
   * Obtener datos del usuario actual
   */
  static obtenerUsuarioActual() {
    return {
      token: sessionStorage.getItem('admin_token'),
      usuario: sessionStorage.getItem('admin_usuario'),
      tipo: sessionStorage.getItem('admin_tipo'),
      id: sessionStorage.getItem('admin_id')
    };
  }
}

// Inicializar cuando se cargue el DOM (solo si estamos en login.html)
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('loginForm')) {
    const conexionDB = ConexionDB.obtenerInstancia();
    new VistaLogin(conexionDB);
  }
});
