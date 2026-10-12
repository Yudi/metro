import {
  buildBusTerminalCatalog,
  normalizeTerminalSearchText,
  parseBusTerminalStop,
  type BusTerminalRow,
} from './bus-terminal-catalog.utils';

const row = (
  stopId: string,
  stopName: string,
  overrides: Partial<BusTerminalRow> = {},
): BusTerminalRow => ({
  stop_id: stopId,
  stop_name: stopName,
  stop_desc: null,
  stop_lat: -23.55,
  stop_lon: -46.63,
  source_agency: 'sptrans',
  source_id: stopId,
  platform_code: null,
  ...overrides,
});

describe('bus terminal catalog builder', () => {
  it('leaves the Silva Bueno street stop outside Sacomã while retaining unlabelled terminal stops', () => {
    const stops = [
      row('330016296', 'Terminal Sacoma', {
        stop_desc: 'R. Silva Bueno, 2638 Ref.: R Lino Coutinho/ R Greenfeld',
        stop_lat: -23.601813,
        stop_lon: -46.601138,
      }),
      row('330016325', 'Terminal Sacomã - Plat. 3', {
        stop_desc: 'Term. Sacomã - Plat. 3 Ref.: R Das Juntas Provisorias/ R Francisco Peres',
        stop_lat: -23.602668,
        stop_lon: -46.602513,
      }),
      row('3305881', 'Terminal Sacomã', {
        stop_lat: -23.602998,
        stop_lon: -46.602819,
      }),
      row('artesp:7323', 'Terminal Sacomã', {
        source_agency: 'artesp',
        source_id: '7323',
        stop_lat: -23.602989,
        stop_lon: -46.602797,
      }),
    ];
    const catalog = buildBusTerminalCatalog(stops);

    expect(catalog).toMatchObject([{
      id: 'terminal:terminal-sacoma',
      stopIds: ['330016325', '3305881', 'artesp:7323'],
      platformCodes: ['3'],
    }]);
    expect(buildBusTerminalCatalog(stops.slice().reverse())).toEqual(catalog);
  });

  it('requires both a street-address conflict and separation from platforms', () => {
    const stops = [
      row('platform', 'Terminal Central - Plat. 1'),
      row('near', 'Terminal Central', {
        stop_desc: 'Rua Central, 100 Ref.: Entrada',
        stop_lat: -23.5504,
      }),
      row('far', 'Terminal Central', {
        stop_desc: 'Av. Central, 200 Ref.: Cruzamento',
        stop_lat: -23.5506,
      }),
      row('terminal-reference', 'Terminal Central', {
        stop_desc: 'Term. Central Ref.: Rua Central, 300',
        stop_lat: -23.5506,
      }),
      row('explicit-platform', 'Terminal Central - Plat. 2', {
        stop_desc: 'Rua Central, 400',
        stop_lat: -23.552,
      }),
    ];

    expect(buildBusTerminalCatalog(stops)[0].stopIds)
      .toEqual(['explicit-platform', 'near', 'platform', 'terminal-reference']);
    expect(buildBusTerminalCatalog([stops[2]])[0].stopIds).toEqual(['far']);
  });

  it('rejects empty identities and keeps long-name IDs bounded, stable and distinct', () => {
    expect(buildBusTerminalCatalog([row('one', 'Terminal ###'), row('two', 'Terminal !!!')]))
      .toEqual([]);
    const prefix = 'Terminal ' + 'Nome '.repeat(50);
    const catalog = buildBusTerminalCatalog([row('one', prefix + 'Norte'), row('two', prefix + 'Sul')]);
    expect(catalog).toHaveLength(2);
    expect(catalog[0].id.length).toBeLessThanOrEqual(168);
    expect(catalog[0].id).not.toBe(catalog[1].id);
    expect(buildBusTerminalCatalog([row('replacement', prefix + 'Norte')])[0].id)
      .toBe(catalog.find((terminal) => terminal.name.endsWith('Norte'))?.id);
  });
  it('does not mistake a terminal name for an explicitly labeled platform', () => {
    expect(parseBusTerminalStop('Terminal Nova Platina'))
      .toMatchObject({ name: 'Terminal Nova Platina' });
    expect(parseBusTerminalStop('Terminal Nova Platina')?.platformCode).toBeUndefined();
    expect(parseBusTerminalStop('Terminal Central - Plat01'))
      .toMatchObject({ name: 'Terminal Central', platformCode: '01' });
    expect(parseBusTerminalStop('Terminal Lapa - Plataforma'))
      .toMatchObject({ name: 'Terminal Lapa' });
    expect(parseBusTerminalStop('Terminal Lapa - Plataforma')?.platformCode).toBeUndefined();
  });

  it('keeps locations supporting both boarding and alighting as boarding points', () => {
    expect(parseBusTerminalStop('Terminal Central - Embarque e Desembarque'))
      .toMatchObject({ name: 'Terminal Central', boardingAllowed: true });
    expect(parseBusTerminalStop('Terminal Central', 'Ponto para embarque e desembarque'))
      .toMatchObject({ boardingAllowed: true });
    expect(parseBusTerminalStop('Terminal Central - Somente Desembarque'))
      .toMatchObject({ boardingAllowed: false });
  });

  it('is order-independent and keeps one ID while membership changes', () => {
    const stops = [
      row('platform-1', 'Terminal Parque Central - Pl. 1'),
      row('platform-2', 'Terminal Parque Central - Plat. 2', {
        stop_lat: -23.5504,
      }),
      row('alighting', 'Terminal Parque Central - Desembarque', {
        stop_lat: -23.5506,
      }),
    ];
    const forward = buildBusTerminalCatalog(stops);
    const reverse = buildBusTerminalCatalog(stops.slice().reverse());
    const withoutOne = buildBusTerminalCatalog(stops.slice(0, 2));
    const singleton = buildBusTerminalCatalog(stops.slice(0, 1));

    expect(forward).toEqual(reverse);
    expect(forward[0].stopIds).toEqual(['alighting', 'platform-1', 'platform-2']);
    expect(forward[0].id).toBe(withoutOne[0].id);
    expect(forward[0].id).toBe(singleton[0].id);
    expect(forward[0].id).toBe('terminal:terminal-parque-central');
  });

  it('deduplicates identical rows and fails closed on contradictory stop IDs', () => {
    const duplicate = row('duplicate', 'Terminal Parque Central');
    expect(buildBusTerminalCatalog([duplicate, { ...duplicate }])[0].stopIds)
      .toEqual(['duplicate']);

    expect(buildBusTerminalCatalog([
      duplicate,
      row('duplicate', 'Terminal Norte'),
      row('other', 'Terminal Parque Central', { stop_lat: -23.5502 }),
    ])).toEqual([]);
  });

  it('fails closed on malformed coordinates and distant homonyms', () => {
    expect(buildBusTerminalCatalog([
      row('valid', 'Terminal Central'),
      row('invalid', 'Terminal Central', { stop_lat: null }),
    ])).toEqual([]);

    expect(buildBusTerminalCatalog([
      row('central-sp', 'Terminal Central', { stop_lat: -23.55 }),
      row('central-far', 'Terminal Central', { stop_lat: -22.9 }),
    ])).toEqual([]);
  });

  it('checks every pair so a bridge stop cannot merge distant ends', () => {
    expect(buildBusTerminalCatalog([
      row('west', 'Terminal Bridge', { stop_lat: -23.55 }),
      row('middle', 'Terminal Bridge', { stop_lat: -23.5536 }),
      row('east', 'Terminal Bridge', { stop_lat: -23.5572 }),
    ])).toEqual([]);
  });

  it('keeps directional and numbered terminals distinct', () => {
    const catalog = buildBusTerminalCatalog([
      row('north', 'Terminal Pinheiros Norte'),
      row('south', 'Terminal Pinheiros Sul'),
      row('central', 'Terminal Pinheiros Central'),
      row('tucuruvi-2', 'Terminal Tucuruvi 2'),
      row('tucuruvi-3', 'Terminal Tucuruvi 3'),
      row('airport-1', 'Terminal Airport1'),
      row('airport-2', 'Terminal Airport2'),
      row('airport-3', 'Terminal Airport3'),
      row('penha', 'Terminal Penha'),
      row('metro-penha', 'Terminal Metrô Penha'),
    ]);

    expect(catalog).toHaveLength(10);
    expect(new Set(catalog.map((terminal) => terminal.id)).size).toBe(10);
    expect(catalog.find((terminal) => terminal.stopIds.includes('airport-1'))?.platformCodes)
      .toEqual([]);
  });

  it('expands conservative abbreviations for identity but keeps D./Dom search-only', () => {
    const catalog = buildBusTerminalCatalog([
      row('full', 'Terminal Parque Dom Pedro II'),
      row('short', 'Term. Pq. D. Pedro II', { source_agency: 'artesp' }),
      row('vila-abbrev', 'Terminal Vl Central'),
      row('vila-full', 'Terminal Vila Central', { stop_lat: -23.5502 }),
      row('different-d', 'Terminal Parque D. Pedro II'),
    ]);

    expect(catalog.find((terminal) => terminal.stopIds.includes('vila-full'))?.stopIds)
      .toEqual(['vila-abbrev', 'vila-full']);
    expect(catalog.find((terminal) => terminal.stopIds.includes('short'))?.stopIds)
      .toEqual(['different-d', 'short']);
    expect(catalog.find((terminal) => terminal.stopIds.includes('full'))?.stopIds)
      .toEqual(['full']);
    expect(normalizeTerminalSearchText('Term. Pq. D. Pedro II'))
      .toBe('terminal parque dom pedro ii');
  });

  it('strips explicit platform address suffixes without losing terminal numbers', () => {
    const parsed = parseBusTerminalStop('Terminal Dom Pedro - Plat 01,0');
    expect(parsed).toMatchObject({
      identity: 'terminal dom pedro',
      platformCode: '01',
      name: 'Terminal Dom Pedro',
    });
    expect(buildBusTerminalCatalog([
      row('platform', 'Terminal Dom Pedro - Plat 01,0'),
      row('number-1', 'Terminal Airport1', { stop_lat: -23.5502 }),
      row('number-2', 'Terminal Airport2', { stop_lat: -23.5504 }),
    ])).toHaveLength(3);
  });

  it('uses matching Ref and platform metadata before dropping comma-number fields', () => {
    const catalog = buildBusTerminalCatalog([
      row('sto-amaro-1a', 'Terminal Sto. Amaro, 1', {
        stop_desc: 'Term. Sto. Amaro, 1 Ref.: Tsa - Plat. 1 - Pmd 1',
      }),
      row('sto-amaro-1b', 'Terminal Sto. Amaro, 1'),
      row('sto-amaro-2', 'Terminal Sto. Amaro, 2', {
        stop_desc: 'Term. Sto. Amaro, 2 Ref.: Tsa - Plat. 2 - Pmd 15',
      }),
      row('metalurgicos', 'Terminal Metalúrgicos, 191', {
        stop_desc: 'Term. Metalúrgicos Ref.: Av. dos Metalúrgicos',
      }),
      row('sapopemba', 'Terminal Sapopemba, 7010', {
        stop_desc: 'Term. Sapopemba Ref.: Av. Sapopemba',
      }),
      row('airport-1', 'Terminal Airport, 1'),
      row('airport-2', 'Terminal Airport, 2', { stop_lat: -23.5502 }),
      row('v-prudente', 'Terminal V. Prudente, 216', {
        stop_desc: 'Term. V. Prudente, 216 Ref.: R. Imbarie',
      }),
      row('vila-prudente', 'Terminal Vila Prudente', { stop_lat: -23.5504 }),
      row('varginha-pmv', 'Terminal Varginha - Pmv 01'),
      row('cidade-tiradentes', 'Terminal Cidade Tiradentes - Plataforma 3 Ref.:Pmv18'),
      row('capelinha-alighting', 'Terminal Capelinha - Desemb. Plat 6,1', {
        stop_desc: 'Proibido o embarque; somente desembarque',
      }),
    ]);

    expect(catalog.find((terminal) => terminal.stopIds.includes('sto-amaro-1a')))
      .toMatchObject({
        name: 'Terminal Santo Amaro',
        stopIds: ['sto-amaro-1a', 'sto-amaro-1b', 'sto-amaro-2'],
        platformCodes: ['1', '2'],
      });
    expect(catalog.find((terminal) => terminal.stopIds.includes('metalurgicos'))?.name)
      .toBe('Terminal Metalúrgicos');
    expect(catalog.find((terminal) => terminal.stopIds.includes('sapopemba'))?.name)
      .toBe('Terminal Sapopemba');
    expect(catalog.find((terminal) => terminal.stopIds.includes('airport-1'))?.id)
      .not.toBe(catalog.find((terminal) => terminal.stopIds.includes('airport-2'))?.id);
    expect(catalog.find((terminal) => terminal.stopIds.includes('v-prudente'))?.name)
      .toBe('Terminal V. Prudente, 216');
    expect(catalog.find((terminal) => terminal.stopIds.includes('vila-prudente'))?.name)
      .toBe('Terminal Vila Prudente');
    expect(catalog.find((terminal) => terminal.stopIds.includes('varginha-pmv'))?.name)
      .toBe('Terminal Varginha');
    expect(catalog.find((terminal) => terminal.stopIds.includes('cidade-tiradentes')))
      .toMatchObject({ name: 'Terminal Cidade Tiradentes', platformCodes: ['3'] });
    expect(catalog.find((terminal) => terminal.stopIds.includes('capelinha-alighting')))
      .toMatchObject({ name: 'Terminal Capelinha', platformCodes: ['6'] });
    expect(parseBusTerminalStop('Terminal Capelinha - Desemb. Plat 6,1'))
      .toMatchObject({ boardingAllowed: false, platformCode: '6' });
  });

  it('keeps all 53 boarding platforms and excludes two Vago rows in a terminal-sized feed set', () => {
    const platformSuffixes = [
      'Plat 0,0',
      'Plat01,0',
      'Plat01,0',
      'Plat02,0',
      'Plat02,0',
      'Plat03,0',
    ];
    const boardingRows = Array.from({ length: 53 }, (_, index) => row(
      `dom-pedro-${String(index).padStart(2, '0')}`,
      `Terminal Parque Dom Pedro II - ${platformSuffixes[index] ?? `Pl. ${index + 1}`}`,
      { stop_lat: -23.54, stop_lon: -46.63 },
    ));
    const catalog = buildBusTerminalCatalog([
      ...boardingRows,
      row('dom-pedro-vago-1', 'Terminal Parque Dom Pedro II - Vago'),
      row('dom-pedro-vago-2', 'Terminal Parque Dom Pedro II - Vago'),
    ]);

    expect(catalog).toHaveLength(1);
    expect(catalog[0].stopIds).toHaveLength(53);
    expect(catalog[0].stopIds).not.toContain('dom-pedro-vago-1');
    expect(catalog[0].stopIds).not.toContain('dom-pedro-vago-2');
    expect(catalog[0].platformCodes).toEqual(expect.arrayContaining(['0', '01', '02', '03']));
  });

  it('requires explicit terminal labels and excludes nearby ordinary stops and side areas', () => {
    expect(buildBusTerminalCatalog([
      row('terminal', 'Terminal Parque Central'),
      row('street', 'Avenida Parque Central, 100', { stop_lat: -23.5502 }),
      row('exterior', 'Terminal Parque Central - Exterior', { stop_lat: -23.5503 }),
      row('opposite', 'Terminal Parque Central - Oposto', { stop_lat: -23.5504 }),
      row('front', 'Terminal Parque Central - Em frente', { stop_lat: -23.5505 }),
      row('side', 'Terminal Parque Central - Lateral', { stop_lat: -23.5506 }),
      row('support', 'Terminal Parque Central - Área de apoio', { stop_lat: -23.5507 }),
      row('vacant', 'Terminal Parque Central - Vago', { stop_lat: -23.5508 }),
      row('prohibited', 'Terminal Parque Central', {
        stop_id: 'prohibited',
        stop_desc: 'Proibido embarque neste ponto',
        stop_lat: -23.5509,
      }),
      row('alighting', 'Terminal Parque Central - Desembarque', {
        stop_lat: -23.551,
      }),
    ])).toMatchObject([{
      stopIds: ['alighting', 'terminal'],
    }]);

    expect(parseBusTerminalStop(
      'Terminal Parque Central',
      'Somente desembarque; proibido embarque',
    )).toMatchObject({ boardingAllowed: false, excluded: false });
  });

});
