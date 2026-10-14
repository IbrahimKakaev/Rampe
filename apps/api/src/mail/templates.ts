import type { MailMessage } from '../infra/mailer.js';

const SIGNATURE =
  '\n\n— L’équipe Rampe\nRampe réalise des pré-audits automatiques d’accessibilité.';

export function verificationEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirmez votre adresse e-mail',
    text:
      `Bonjour ${name},\n\nPour activer votre compte Rampe, confirmez votre adresse en ouvrant ce lien dans les 24 heures :\n\n${link}\n\n` +
      'Si vous n’avez pas créé de compte, ignorez ce message.' +
      SIGNATURE,
  };
}

export function accountExistsEmail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Vous avez déjà un compte Rampe',
    text:
      'Bonjour,\n\nQuelqu’un, vous peut-être, a voulu créer un compte Rampe avec cette adresse. Vous en avez déjà un.\n\n' +
      `Si vous avez oublié votre mot de passe, vous pouvez le réinitialiser :\n\n${link}\n\nSinon, ignorez ce message.` +
      SIGNATURE,
  };
}

export function passwordResetEmail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Réinitialisation de votre mot de passe',
    text:
      `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien dans l’heure qui vient :\n\n${link}\n\n` +
      'Si vous n’avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.' +
      SIGNATURE,
  };
}

export function invitationEmail(
  to: string,
  organization: string,
  inviter: string,
  link: string,
): MailMessage {
  return {
    to,
    subject: `Invitation à rejoindre ${organization} sur Rampe`,
    text:
      `Bonjour,\n\n${inviter} vous invite à rejoindre l’organisation « ${organization} » sur Rampe.\n\n` +
      `Pour accepter, connectez-vous ou créez un compte avec cette adresse, puis ouvrez ce lien dans les 7 jours :\n\n${link}` +
      SIGNATURE,
  };
}
