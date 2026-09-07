export enum FavoriteType {
  BikeStation = 'bikeStation',
  RailStation = 'railStation',
  RailLine = 'railLine',
  BusStop = 'busStop',
  BusRoute = 'busRoute',
}

export type FavoriteTypes =
  | 'bikeStation'
  | 'railStation'
  | 'railLine'
  | 'busStop'
  | 'busRoute';

export type FavoriteList = {
  [K in FavoriteTypes]: string[];
};

export function createEmptyFavorites(): FavoriteList {
  return {
    bikeStation: [],
    railStation: [],
    railLine: [],
    busStop: [],
    busRoute: [],
  };
}

export const emptyFavorites: FavoriteList = createEmptyFavorites();
