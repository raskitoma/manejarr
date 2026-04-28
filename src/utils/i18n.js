/**
 * Internationalization (i18n) Manager
 */

const DICTIONARY = {
  en: {
    // General
    dashboard: 'Dashboard',
    settings: 'Settings',
    scheduler: 'Scheduler',
    logs: 'Event Logs',
    save_test: '💾 Save & Test',
    connected: 'Connected',
    offline: 'Offline',
    connecting: 'Connecting...',
    checking: 'Checking...',
    idle: 'Idle',
    logout: 'Logout',

    // Dashboard
    torrent_overview: 'Torrent Overview',
    all_labels: 'All Labels',
    media: 'Media',
    ignore: 'Ignore',
    for_deletion: 'For Deletion',
    name: 'Name',
    label: 'Label',
    ratio: 'Ratio',
    seed_time: 'Seed Time',
    size: 'Size',
    run_now: 'Run Now',
    dry_run: 'Dry Run',
    running: 'Running...',
    search: 'Search',
    added: 'Added',
    started: 'started',

    // Settings
    services: 'Services',
    rules: 'Rules',
    notifications: 'Notifications',
    account: 'Account',
    host: 'Host',
    port: 'Port',
    password: 'Password',
    api_key: 'API Key',
    min_seeding_days: 'Minimum Seeding (Days)',
    min_ratio: 'Minimum Required Ratio',
    log_retention: 'Log Retention (Days)',
    save_rules: '💾 Save Rules',
    enable_email: 'Enable Email',
    enable_telegram: 'Enable Telegram',
    username: 'Username',
    from_address: 'From Address',
    to_address: 'To Address',
    bot_token: 'Bot Token',
    chat_id: 'Chat ID',
    change_password: 'Change Password',
    current_password: 'Current Password',
    new_password: 'New Password',
    confirm_password: 'Confirm New Password',
    update_password: 'Update Password',

    // Scheduler
    scheduled_runs: 'Scheduled Runs',
    add_schedule: 'Add Schedule',
    no_schedules: 'No schedules configured',
    schedule_hint: 'Add a schedule to automatically run the orchestration at regular intervals.',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save_changes: 'Save Changes',
    create_schedule: 'Create Schedule',
    schedule_enabled: 'Schedule enabled',
    schedule_disabled: 'Schedule disabled',
    e_g_daily_cleanup: 'e.g., Daily Cleanup',
    please_enter_a_schedule_name: 'Please enter a schedule name',
    schedule_created: 'Schedule created',
    schedule_updated: 'Schedule updated',

    // Logs
    run_logs: 'Run Logs',
    events: 'Events',
    clear_all: '🗑️ Clear All Logs',
    clear_confirm: 'Are you sure you want to permanently delete all logs?',
    no_logs: 'No logs available',
    type: 'Type',
    message: 'Message',
    time: 'Time',
    run_id: 'Run ID',
    status: 'Status',
    actions: 'Actions',
    timestamp: 'Timestamp',
    level: 'Level',
    category: 'Category',
    started_at: 'Started At',
    finished_at: 'Finished At',
    summary: 'Summary',
    loading: 'Loading...',
    logs_cleared: 'Logs cleared',

    // 404
    page_not_found: '404 - Page Not Found',
    page_not_found_desc: 'We couldn\'t find the page you\'re looking for.',
    redirecting: 'Redirecting to the dashboard in',
    seconds: 'seconds...',

    // Auth
    sign_in: 'Sign In',
    sign_in_title: 'Sign In to Manejarr',
    enter_admin: 'Enter your admin credentials',
    verification_required: 'Verification required',
    two_fa_code: 'Security Code',
    back_to_password: 'Back to password',
    enter_2fa_code: 'Enter the 6-digit code from your app or a recovery code.',

    // Theme & Language
    light_mode: 'Light',
    dark_mode: 'Dark',
    language: 'Language',
    english: 'English',
    spanish: 'Spanish',
    reset: 'Reset',

    // Torrent Match
    link_torrent: 'Link Torrent to Media',
    search_media: 'Search movies & series...',
    search_hint: 'Type to search Radarr & Sonarr for matching media',
    no_results: 'No results found',
    link_success: 'Linked successfully to',
  },
  es: {
    // General
    dashboard: 'Panel',
    settings: 'Ajustes',
    scheduler: 'Programador',
    logs: 'Registros',
    save_test: '💾 Guardar y Probar',
    connected: 'Conectado',
    offline: 'Desconectado',
    connecting: 'Conectando...',
    checking: 'Comprobando...',
    idle: 'Inactivo',
    logout: 'Cerrar sesión',

    // Dashboard
    torrent_overview: 'Resumen de Torrents',
    all_labels: 'Todas las etiquetas',
    media: 'Multimedia',
    ignore: 'Ignorar',
    for_deletion: 'Para Borrar',
    name: 'Nombre',
    label: 'Etiqueta',
    ratio: 'Proporción',
    seed_time: 'Tiempo',
    size: 'Tamaño',
    run_now: 'Ejecutar Ahora',
    dry_run: 'Simulacro',
    running: 'Ejecutando...',
    search: 'Buscar',
    added: 'Añadido',
    started: 'iniciado',

    // Settings
    services: 'Servicios',
    rules: 'Reglas',
    notifications: 'Notificaciones',
    account: 'Cuenta',
    host: 'Servidor',
    port: 'Puerto',
    password: 'Clave',
    api_key: 'Clave API',
    min_seeding_days: 'Tiempo Mínimo (Días)',
    min_ratio: 'Proporción Mínima',
    log_retention: 'Retención de Registros (Días)',
    save_rules: '💾 Guardar Reglas',
    enable_email: 'Activar Email',
    enable_telegram: 'Activar Telegram',
    username: 'Usuario',
    from_address: 'Dirección Remitente',
    to_address: 'Dirección Destino',
    bot_token: 'Token del Bot',
    chat_id: 'ID del Chat',
    change_password: 'Cambiar Clave',
    current_password: 'Clave Actual',
    new_password: 'Nueva Clave',
    confirm_password: 'Confirmar Nueva Clave',
    update_password: 'Actualizar Clave',

    // Scheduler
    scheduled_runs: 'Ejecuciones Programadas',
    add_schedule: 'Añadir Programa',
    no_schedules: 'No hay programas configurados',
    schedule_hint: 'Añade un programa para automatizar la orquestación en intervalos regulares.',
    edit: 'Editar',
    delete: 'Borrar',
    cancel: 'Cancelar',
    save_changes: 'Guardar Cambios',
    create_schedule: 'Crear Programa',
    schedule_enabled: 'Programa activado',
    schedule_disabled: 'Programa desactivado',
    e_g_daily_cleanup: 'ej. Limpieza Diaria',
    please_enter_a_schedule_name: 'Por favor, introduce un nombre para el programa',
    schedule_created: 'Programa creado',
    schedule_updated: 'Programa actualizado',

    // Logs
    run_logs: 'Historial',
    events: 'Eventos',
    clear_all: '🗑️ Borrar Todo',
    clear_confirm: '¿Estás seguro de que quieres borrar todos los registros permanentemente?',
    no_logs: 'No hay registros',
    type: 'Tipo',
    message: 'Mensaje',
    time: 'Hora',
    run_id: 'ID Ejecución',
    status: 'Estado',
    actions: 'Acciones',
    timestamp: 'Marca de tiempo',
    level: 'Nivel',
    category: 'Categoría',
    started_at: 'Iniciado el',
    finished_at: 'Finalizado el',
    summary: 'Resumen',
    loading: 'Cargando...',
    logs_cleared: 'Registros borrados',

    // 404
    page_not_found: '404 - Página no encontrada',
    page_not_found_desc: 'No hemos podido encontrar la página que buscas.',
    redirecting: 'Redirigiendo al panel en',
    seconds: 'segundos...',

    // Auth
    sign_in: 'Iniciar Sesión',
    sign_in_title: 'Iniciar Sesión en Manejarr',
    enter_admin: 'Introduce tus credenciales de administrador',
    verification_required: 'Verificación requerida',
    two_fa_code: 'Código de seguridad',
    back_to_password: 'Volver a la contraseña',
    enter_2fa_code: 'Introduce el código de 6 dígitos de tu app o un código de recuperación.',

    // Theme & Language
    light_mode: 'Modo Claro',
    dark_mode: 'Modo Oscuro',
    language: 'Idioma',
    reset: 'Limpiar',

    // Torrent Match
    link_torrent: 'Vincular Torrent a Multimedia',
    search_media: 'Buscar películas y series...',
    search_hint: 'Escribe para buscar en Radarr y Sonarr',
    no_results: 'No se encontraron resultados',
    link_success: 'Vinculado correctamente a',
  }
};

let currentLang = 'en';

export function initI18n() {
  const saved = localStorage.getItem('manejarr_lang');
  if (saved && DICTIONARY[saved]) {
    currentLang = saved;
  }
  return currentLang;
}

export function setLanguage(lang) {
  if (DICTIONARY[lang]) {
    currentLang = lang;
    localStorage.setItem('manejarr_lang', lang);
    
    // Dispatch event so UI can re-render
    window.dispatchEvent(new CustomEvent('i18n:changed'));
  }
}

export function getLanguage() {
  return currentLang;
}

export function t(key) {
  return DICTIONARY[currentLang]?.[key] || DICTIONARY['en']?.[key] || key;
}
