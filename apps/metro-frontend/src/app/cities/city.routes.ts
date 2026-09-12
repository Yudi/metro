import type { Route, Routes } from '@angular/router';
import { SeoGuard } from '@metro/shared/seo';
import type { TransitCity } from '@metro/shared/cities';

    path,
    pathMatch: path === '' ? 'full' : undefined,
    data: { cityId: city.id },
    canActivateChild: [SeoGuard],
    loadComponent: () =>
      import('../shared/layout/toolbar-layout/toolbar-layout.component').then(
        (m) => m.ToolbarLayoutComponent,
      ),
    children: featureRoutes,
  };
}
