import { afterNextRender, Component, DestroyRef, inject, Injector } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { webPath } from '@rampe/shared';
import { filter } from 'rxjs';

import { Announcer } from './core/announcer';
import { Session } from './core/session';

@Component({
  selector: 'rampe-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(Session);
  protected readonly announcer = inject(Announcer);
  private readonly router = inject(Router);

  protected readonly paths = {
    home: webPath('home'),
    dashboard: webPath('dashboard'),
    robot: webPath('robot'),
    login: webPath('login'),
    register: webPath('register'),
  };

  constructor() {
    this.focusHeadingAfterNavigation();
  }

  /**
   * With `<base href="/">`, a plain `#contenu` link would navigate to the home
   * page from any other route. Moving focus by hand keeps the skip link working
   * everywhere.
   */
  protected skipToContent(event: Event, main: HTMLElement): void {
    event.preventDefault();
    main.focus();
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl(this.paths.home);
    this.announcer.announce('Déconnexion effectuée.');
  }

  /**
   * A single-page application does not reload on navigation, so nothing tells
   * a screen reader or keyboard user that the page changed. After each change
   * of page, the focus moves to the page's main heading, which is read out.
   * A change of query parameters only (a filter, a grouping) keeps the focus.
   */
  private focusHeadingAfterNavigation(): void {
    const injector = inject(Injector);
    let previousPath: string | null = null;
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split(/[?#]/)[0] ?? '';
        const first = previousPath === null;
        const samePage = path === previousPath;
        previousPath = path;
        if (first || samePage) {
          return;
        }
        afterNextRender(
          () => {
            const heading = document.querySelector<HTMLElement>('main h1');
            if (heading !== null) {
              heading.tabIndex = -1;
              heading.focus();
            }
          },
          { injector },
        );
      });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
    });
  }
}
