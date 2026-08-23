import { validate } from 'class-validator';
import { BoundingBoxInput } from './geography.input';

describe('BoundingBoxInput', () => {
  it('rejects reversed latitude and longitude bounds', async () => {
    const bounds = Object.assign(new BoundingBoxInput(), {
      minLat: -20,
      maxLat: -30,
      minLng: -40,
      maxLng: -50,
    });

    const errors = await validate(bounds);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['maxLat', 'maxLng']),
    );
  });

  it('accepts an ordered zero-area box', async () => {
    const bounds = Object.assign(new BoundingBoxInput(), {
      minLat: -23.55,
      maxLat: -23.55,
      minLng: -46.63,
      maxLng: -46.63,
    });

    await expect(validate(bounds)).resolves.toEqual([]);
  });
});
