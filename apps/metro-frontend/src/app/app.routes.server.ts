import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    path: 'sobre',
    renderMode: RenderMode.Server,
  },
  {
    path: 'telefones',
    renderMode: RenderMode.Server,
  },
  {
    path: 'notifications',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
