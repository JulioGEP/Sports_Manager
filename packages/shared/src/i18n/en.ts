export default {
  errors: {
    bad_request: "The request is not valid.",
    unauthorized: "You need to sign in.",
    forbidden: "You do not have permission to do this.",
    conflict: "The change conflicts with the current state.",
    not_found: "We could not find what you are looking for.",
    invitation_expired: "This invitation has expired. Ask the club for a new one.",
    invitation_email_mismatch: "This invitation is for a different email address.",
    internal: "An unexpected error occurred.",
  },
  email: {
    signature: "The platform team",
    fallbackLink: "If the button does not work, copy this link into your browser:",
    invitation: {
      subject: "{club} invites you to join",
      greeting: "Hello,",
      body: "{inviter} has invited you to join {club} as {role}.",
      action: "Accept the invitation",
      expires: "The link expires in {days} days.",
      ignore: "If you were not expecting this invitation, you can ignore this message.",
    },
    passwordReset: {
      subject: "Reset your password",
      greeting: "Hello, {name}.",
      body: "We received a request to reset the password of your account at {club}.",
      action: "Reset the password",
      expires: "The link expires in {minutes} minutes.",
      ignore:
        "If you did not request this change, ignore this message. Your password will stay the same.",
    },
  },
} as const;
