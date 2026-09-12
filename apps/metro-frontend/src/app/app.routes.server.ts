import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sp',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sp/sobre',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sp/telefones',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sp/notifications',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
