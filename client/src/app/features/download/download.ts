import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import {
  desktopDownloadsConfigured,
  fetchLatestRelease,
  isDesktopApp,
  isWindows,
  releasesPageUrl,
} from '../../core/desktop-app';

@Component({
  selector: 'app-download',
  imports: [RouterLink, DatePipe, DecimalPipe],
  styleUrls: ['../auth/auth.scss', './download.scss'],
  template: `
    <main class="auth-page">
      <section class="auth-card card download-card">
        <div class="brand"><span class="logo">$</span> Expense Tracker</div>
        <h1>Get the Windows app</h1>
        <p class="muted">
          Expense Tracker in its own window. Everything works without an internet connection, and the app updates
          itself when a new version comes out.
        </p>

        @if (inDesktopApp) {
          <div class="alert alert-success">You're already using the desktop app.</div>
        } @else if (!configured) {
          <div class="alert notice">Downloads aren't available yet. Check back soon.</div>
        } @else {
          @if (!onWindows) {
            <div class="alert notice">The desktop app is for Windows 10 and 11 (64-bit). You can keep using this website on any device.</div>
          }

          @if (release.isLoading()) {
            <button class="btn btn-primary btn-block" type="button" disabled>Finding the latest version…</button>
          } @else if (release.value(); as r) {
            <a class="btn btn-primary btn-block download-btn" [href]="r.url" download>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1ZM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z" />
              </svg>
              Download for Windows
            </a>
            <p class="meta">
              Version {{ r.version }} · {{ r.size / 1048576 | number: '1.0-0' }} MB · released {{ r.publishedAt | date: 'mediumDate' }}
            </p>
          } @else {
            <a class="btn btn-primary btn-block" [href]="releasesUrl" target="_blank" rel="noopener">Open the downloads page</a>
            <p class="meta">
              {{ release.error() ? "Couldn't check for the latest version." : 'No version has been published yet.' }}
            </p>
          }

          <ol class="steps">
            <li>Run the downloaded <strong>Expense Tracker Setup</strong> file.</li>
            <li>
              If Windows shows <em>"Windows protected your PC"</em>, click <strong>More info</strong>, then
              <strong>Run anyway</strong>. This appears because the installer isn't signed yet.
            </li>
            <li>Create an account in the app and start adding expenses.</li>
          </ol>

          <p class="hint">
            The desktop app keeps its data on your computer, separate from your account on this website, so you'll create
            a new account the first time you open it.
          </p>
        }

        <p class="switch">
          <a [routerLink]="signedIn() ? '/dashboard' : '/login'">← Back to {{ signedIn() ? 'the dashboard' : 'sign in' }}</a>
        </p>
      </section>
    </main>
  `,
})
export class DownloadPage {
  private readonly auth = inject(AuthStore);
  protected readonly signedIn = computed(() => this.auth.isAuthenticated());
  protected readonly inDesktopApp = isDesktopApp();
  protected readonly onWindows = isWindows();
  protected readonly configured = desktopDownloadsConfigured;
  protected readonly releasesUrl = releasesPageUrl;

  protected readonly release = resource({
    loader: ({ abortSignal }) =>
      this.inDesktopApp ? Promise.resolve(null) : fetchLatestRelease(abortSignal),
  });
}
