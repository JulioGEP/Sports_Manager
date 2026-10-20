export default {
  errors: {
    bad_request: "La petición no es válida.",
    unauthorized: "Tienes que iniciar sesión.",
    forbidden: "No tienes permiso para hacer esto.",
    conflict: "El cambio choca con el estado actual.",
    not_found: "No se ha encontrado lo que buscas.",
    invitation_expired: "La invitación ha caducado. Pide una nueva al club.",
    invitation_email_mismatch: "Esta invitación es para otra dirección de email.",
    internal: "Ha ocurrido un error inesperado.",
  },
  email: {
    signature: "El equipo de la plataforma",
    fallbackLink: "Si el botón no funciona, copia este enlace en tu navegador:",
    invitation: {
      subject: "{club} te invita a unirte",
      greeting: "Hola,",
      body: "{inviter} te ha invitado a unirte a {club} como {role}.",
      action: "Aceptar la invitación",
      expires: "El enlace caduca en {days} días.",
      ignore: "Si no esperabas esta invitación, puedes ignorar este mensaje.",
    },
    passwordReset: {
      subject: "Restablece tu contraseña",
      greeting: "Hola, {name}.",
      body: "Hemos recibido una petición para restablecer la contraseña de tu cuenta en {club}.",
      action: "Restablecer la contraseña",
      expires: "El enlace caduca en {minutes} minutos.",
      ignore:
        "Si no has pedido este cambio, ignora este mensaje. Tu contraseña seguirá siendo la misma.",
    },
  },
} as const;
