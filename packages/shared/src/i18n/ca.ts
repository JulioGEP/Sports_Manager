export default {
  errors: {
    bad_request: "La petició no és vàlida.",
    unauthorized: "Has d'iniciar sessió.",
    forbidden: "No tens permís per fer això.",
    conflict: "El canvi xoca amb l'estat actual.",
    not_found: "No s'ha trobat el que busques.",
    invitation_expired: "La invitació ha caducat. Demana'n una de nova al club.",
    invitation_email_mismatch: "Aquesta invitació és per a una altra adreça de correu.",
    payload_too_large: "El fitxer és massa gran.",
    unsupported_media_type: "Format de fitxer no admès.",
    internal: "S'ha produït un error inesperat.",
  },
  email: {
    signature: "L'equip de la plataforma",
    fallbackLink: "Si el botó no funciona, copia aquest enllaç al navegador:",
    invitation: {
      subject: "{club} et convida a unir-t'hi",
      greeting: "Hola,",
      body: "{inviter} t'ha convidat a unir-te a {club} com a {role}.",
      action: "Acceptar la invitació",
      expires: "L'enllaç caduca d'aquí a {days} dies.",
      ignore: "Si no esperaves aquesta invitació, pots ignorar aquest missatge.",
    },
    passwordReset: {
      subject: "Restableix la contrasenya",
      greeting: "Hola, {name}.",
      body: "Hem rebut una petició per restablir la contrasenya del teu compte a {club}.",
      action: "Restablir la contrasenya",
      expires: "L'enllaç caduca d'aquí a {minutes} minuts.",
      ignore:
        "Si no has demanat aquest canvi, ignora aquest missatge. La contrasenya continuarà sent la mateixa.",
    },
  },
} as const;
