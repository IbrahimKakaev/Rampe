import type { Routes } from '@angular/router';
import { WEB_ROUTES } from '@rampe/shared';

import { AuditGridPage } from './audits/audit-grid-page';
import { AuditPage } from './audits/audit-page';
import { StatementPage } from './audits/statement-page';
import { AcceptInvitationPage } from './auth/accept-invitation-page';
import { ForgotPasswordPage } from './auth/forgot-password-page';
import { LoginPage } from './auth/login-page';
import { RegisterPage } from './auth/register-page';
import { ResetPasswordPage } from './auth/reset-password-page';
import { VerifyEmailPage } from './auth/verify-email-page';
import { guestOnly, requireSession, toFirstOrganization } from './core/guards';
import { pageTitle } from './core/page-title';
import { HomePage } from './home/home-page';
import { NoOrganizationPage } from './pages/no-organization-page';
import { NotFoundPage } from './pages/not-found-page';
import { RobotPage } from './pages/robot-page';
import { FindingPage } from './scans/finding-page';
import { ScanPage } from './scans/scan-page';
import { MembersPage } from './sites/members-page';
import { NewSitePage } from './sites/new-site-page';
import { OrganizationPage } from './sites/organization-page';
import { SitePage } from './sites/site-page';
import { SitesPage } from './sites/sites-page';
import { SiteVerificationPage } from './sites/site-verification-page';

/**
 * Every path comes from WEB_ROUTES, shared with the API's e-mail links and the
 * end-to-end tests; a test checks that both lists match. Pages with data set a
 * more precise title themselves once it is loaded.
 */
export const routes: Routes = [
  {
    path: WEB_ROUTES.home,
    pathMatch: 'full',
    component: HomePage,
    title: "Rampe — pré-audit d'accessibilité RGAA",
  },
  {
    path: WEB_ROUTES.login,
    component: LoginPage,
    canActivate: [guestOnly],
    title: pageTitle('Se connecter'),
  },
  {
    path: WEB_ROUTES.register,
    component: RegisterPage,
    canActivate: [guestOnly],
    title: pageTitle('Créer un compte'),
  },
  {
    path: WEB_ROUTES.verifyEmail,
    component: VerifyEmailPage,
    title: pageTitle('Confirmation de votre adresse e-mail'),
  },
  {
    path: WEB_ROUTES.forgotPassword,
    component: ForgotPasswordPage,
    title: pageTitle('Mot de passe oublié'),
  },
  {
    path: WEB_ROUTES.resetPassword,
    component: ResetPasswordPage,
    title: pageTitle('Choisir un nouveau mot de passe'),
  },
  {
    path: WEB_ROUTES.acceptInvitation,
    component: AcceptInvitationPage,
    canActivate: [requireSession],
    title: pageTitle('Rejoindre une organisation'),
  },
  { path: WEB_ROUTES.robot, component: RobotPage, title: pageTitle('RampeBot, le robot de Rampe') },
  {
    path: WEB_ROUTES.dashboard,
    component: NoOrganizationPage,
    canActivate: [requireSession, toFirstOrganization],
    title: pageTitle('Mes sites'),
  },
  {
    path: WEB_ROUTES.organization,
    component: OrganizationPage,
    canActivate: [requireSession],
    title: pageTitle('Paramètres de l’organisation'),
  },
  {
    path: WEB_ROUTES.members,
    component: MembersPage,
    canActivate: [requireSession],
    title: pageTitle('Membres'),
  },
  {
    path: WEB_ROUTES.sites,
    component: SitesPage,
    canActivate: [requireSession],
    title: pageTitle('Sites'),
  },
  // Before the site page, whose `:site` parameter would otherwise take "nouveau".
  {
    path: WEB_ROUTES.newSite,
    component: NewSitePage,
    canActivate: [requireSession],
    title: pageTitle('Ajouter un site'),
  },
  {
    path: WEB_ROUTES.site,
    component: SitePage,
    canActivate: [requireSession],
    title: pageTitle('Site'),
  },
  {
    path: WEB_ROUTES.siteVerification,
    component: SiteVerificationPage,
    canActivate: [requireSession],
    title: pageTitle('Prouver que le site vous appartient'),
  },
  {
    path: WEB_ROUTES.scan,
    component: ScanPage,
    canActivate: [requireSession],
    title: pageTitle('Résultats du scan'),
  },
  {
    path: WEB_ROUTES.finding,
    component: FindingPage,
    canActivate: [requireSession],
    title: pageTitle('Défaut'),
  },
  {
    path: WEB_ROUTES.audit,
    component: AuditPage,
    canActivate: [requireSession],
    title: pageTitle('Audit manuel'),
  },
  {
    path: WEB_ROUTES.auditPage,
    component: AuditGridPage,
    canActivate: [requireSession],
    title: pageTitle('Grille RGAA'),
  },
  {
    path: WEB_ROUTES.statement,
    component: StatementPage,
    canActivate: [requireSession],
    title: pageTitle('Déclaration d’accessibilité'),
  },
  { path: WEB_ROUTES.notFound, component: NotFoundPage, title: pageTitle('Page introuvable') },
];
