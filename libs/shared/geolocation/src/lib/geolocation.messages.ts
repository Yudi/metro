import type { LocationPermissionState } from './geolocation.types';

export function getLocationPermissionMessage(
  permission: LocationPermissionState,
): string {
  switch (permission) {
    case 'denied':
      return 'Acesso à localização negado. Permita nas configurações do navegador.';
    case 'unavailable':
      return 'Localização não disponível neste dispositivo.';
    case 'granted':
      return 'Localização disponível.';
    case 'prompt':
    default:
      return 'Clique para permitir acesso à sua localização.';
  }
}
