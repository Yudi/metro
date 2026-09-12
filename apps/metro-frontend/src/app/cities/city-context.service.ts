import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { filter, map, of } from 'rxjs';
import { cityPath, DEFAULT_CITY, getCity } from '@metro/shared/cities';

/** The selected route city, also available to root services and overlay dialogs. */
@Injectable({ providedIn: 'root' })
export class CityContextService {
  private readonly router = inject(Router, { optional: true });
  private readonly url = toSignal(
    this.router ? this.router.events.pipe(
      filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd ||
        event instanceof NavigationCancel || event instanceof NavigationError),
      map((event) => {
        if (event instanceof NavigationEnd) return event.urlAfterRedirects;
        if (event instanceof NavigationStart) return event.url;
        return this.router?.url ?? '';
      }),
    ) : of(''),
    { initialValue: this.router?.getCurrentNavigation()?.extractedUrl.toString() ?? this.router?.url ?? '' },
  );
  readonly city = computed(() => getCity(this.url().split(/[/?#]/)[1] ?? '') ?? DEFAULT_CITY);
  readonly id = computed(() => this.city().id);
  readonly center = computed<[number, number]>(() => [
    this.city().map.center.longitude, this.city().map.center.latitude,
  ]);

  path(path = ''): string {
    return cityPath(path, this.id());
  }
}
